#![cfg_attr(test, allow(dead_code))]

use crate::{
    managed_postgres_config::{
        create_managed_paths, discover_managed_postgres_binaries, generated_managed_config,
        read_managed_config, write_managed_config, ManagedPostgresConnectionConfig,
        ManagedPostgresPaths, MANAGED_POSTGRES_DIR,
    },
    managed_postgres_migrations::{
        managed_migration_sql, migration_state_from_schema, read_migration_state,
        write_migration_state,
    },
    managed_postgres_process::{
        pg_version_exists, pid_file_owns_data_dir, read_pid_file, remove_pid_file, run_initdb,
        spawn_postgres, write_pid_file, ManagedPostgresPidFile,
    },
    postgres::{connect, schema_ready_from_rows, CORE_SCHEMA_TABLES},
    workspace::DesktopCommandError,
};
use postgres::Client;
use serde::Serialize;
use std::{
    env,
    path::{Path, PathBuf},
    process::Child,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct ManagedPostgresManager {
    inner: Mutex<ManagedPostgresState>,
}

#[derive(Default)]
struct ManagedPostgresState {
    child: Option<OwnedManagedPostgres>,
    last_status: Option<ManagedPostgresStatus>,
}

struct OwnedManagedPostgres {
    child: Child,
    pid_file: ManagedPostgresPidFile,
}

impl Drop for OwnedManagedPostgres {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedPostgresStatus {
    state: String,
    label: String,
    detail: String,
    available: bool,
    reason: Option<String>,
    configured: bool,
    source: Option<String>,
    data_dir: Option<String>,
    host: Option<String>,
    port: Option<u16>,
    database: Option<String>,
    user: Option<String>,
    pid: Option<u32>,
    started_at: Option<String>,
    migration_state: String,
}

impl ManagedPostgresManager {
    pub(crate) fn status(
        &self,
        root: &Path,
        bundled_dirs: &[PathBuf],
    ) -> Result<ManagedPostgresStatus, DesktopCommandError> {
        let paths = ManagedPostgresPaths::for_root(root);
        let mut state = self.lock_state()?;
        if let Some(owned) = state.child.as_mut() {
            if matches!(owned.child.try_wait(), Ok(Some(_))) {
                state.child = None;
            }
        }

        let status = status_for_paths(&paths, bundled_dirs, state.child.as_ref());
        state.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn initialize(
        &self,
        root: &Path,
        bundled_dirs: &[PathBuf],
    ) -> Result<ManagedPostgresStatus, DesktopCommandError> {
        let paths = create_managed_paths(root).map_err(|err| {
            DesktopCommandError::io(
                "managed_postgres_app_data_unavailable",
                "Failed to create managed Postgres app data directories",
                err,
            )
        })?;
        set_managed_home_env(&paths);
        let availability = default_availability(bundled_dirs);
        let Some(binaries) = availability.binaries else {
            return Ok(unavailable_status(&paths, availability.reason));
        };
        let config = ensure_config(&paths)?;
        if !pg_version_exists(&paths) {
            run_initdb(&binaries, &paths, &config).map_err(|detail| {
                DesktopCommandError::new(
                    "managed_postgres_initdb_failed",
                    "Failed to initialize managed Postgres data directory",
                    Some(redact_detail(&detail, &config)),
                )
            })?;
        }
        self.status(root, bundled_dirs)
    }

    pub(crate) fn start(
        &self,
        root: &Path,
        bundled_dirs: &[PathBuf],
    ) -> Result<ManagedPostgresStatus, DesktopCommandError> {
        let paths = create_managed_paths(root).map_err(|err| {
            DesktopCommandError::io(
                "managed_postgres_app_data_unavailable",
                "Failed to create managed Postgres app data directories",
                err,
            )
        })?;
        set_managed_home_env(&paths);
        let availability = default_availability(bundled_dirs);
        let Some(binaries) = availability.binaries else {
            return Ok(unavailable_status(&paths, availability.reason));
        };
        let config = ensure_started_config(&paths)?;
        if !pg_version_exists(&paths) {
            return Ok(configured_status(
                &paths,
                &config,
                "placeholder",
                "Managed Postgres not initialized",
                "Run initialize_managed_postgres before starting the managed database",
                true,
                None,
                None,
            ));
        }

        let mut state = self.lock_state()?;
        if let Some(status) = running_owned_status(&mut state, &paths, &config)? {
            return Ok(status);
        }
        let child = spawn_postgres(&binaries, &paths, &config).map_err(|detail| {
            DesktopCommandError::new(
                "managed_postgres_spawn_failed",
                "Failed to start managed Postgres",
                Some(redact_detail(&detail, &config)),
            )
        })?;
        let pid_file = write_pid_file(&paths, child.id()).map_err(|detail| {
            DesktopCommandError::new(
                "managed_postgres_pid_write_failed",
                "Failed to write managed Postgres pid file",
                Some(detail),
            )
        })?;
        state.child = Some(OwnedManagedPostgres { child, pid_file });
        let ready = wait_for_postgres_accepting_connections(&config);
        let status = configured_status(
            &paths,
            &config,
            if ready { "ready" } else { "degraded" },
            if ready {
                "Managed Postgres started"
            } else {
                "Managed Postgres starting"
            },
            if ready {
                "Managed Postgres process is accepting maintenance connections"
            } else {
                "Managed Postgres process was started; readiness probe is still pending"
            },
            true,
            state.child.as_ref().map(|owned| owned.pid_file.pid),
            state
                .child
                .as_ref()
                .map(|owned| owned.pid_file.started_at.clone()),
        );
        state.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn stop(&self, root: &Path) -> Result<ManagedPostgresStatus, DesktopCommandError> {
        let paths = ManagedPostgresPaths::for_root(root);
        let config = read_managed_config(&paths).ok().flatten();
        let mut state = self.lock_state()?;
        let Some(mut owned) = state.child.take() else {
            let status = stop_guard_status(&paths, config.as_ref());
            state.last_status = Some(status.clone());
            return Ok(status);
        };

        if !pid_file_owns_data_dir(&owned.pid_file, &paths.data_dir) {
            let status = configured_status(
                &paths,
                config.as_ref().unwrap_or(&default_status_config()),
                "degraded",
                "Managed Postgres stop guarded",
                "Refused to stop because the pid file does not match the managed data directory",
                true,
                Some(owned.pid_file.pid),
                Some(owned.pid_file.started_at.clone()),
            );
            state.last_status = Some(status.clone());
            return Ok(status);
        }
        let _ = owned.child.kill();
        let _ = owned.child.wait();
        remove_pid_file(&paths);
        let status = configured_status(
            &paths,
            config.as_ref().unwrap_or(&default_status_config()),
            "offline",
            "Managed Postgres stopped",
            "Stopped managed Postgres process started by this app session",
            true,
            None,
            None,
        );
        state.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn migrate(
        &self,
        root: &Path,
    ) -> Result<ManagedPostgresStatus, DesktopCommandError> {
        let paths = ManagedPostgresPaths::for_root(root);
        let config = read_managed_config(&paths)
            .map_err(|detail| {
                DesktopCommandError::new(
                    "managed_postgres_config_read_failed",
                    "Failed to read managed Postgres config",
                    Some(detail),
                )
            })?
            .ok_or_else(|| {
                DesktopCommandError::new(
                    "managed_postgres_not_initialized",
                    "Managed Postgres is not initialized",
                    Some("Missing managed connection config".into()),
                )
            })?;
        ensure_managed_database(&config)?;
        let mut client =
            connect(&config.runtime_config("managed postgres migration")).map_err(|detail| {
                DesktopCommandError::new(
                    "managed_postgres_migration_connect_failed",
                    "Failed to connect to managed Postgres for migration",
                    Some(redact_detail(&detail, &config)),
                )
            })?;
        client
            .batch_execute(managed_migration_sql())
            .map_err(|error| {
                DesktopCommandError::new(
                    "managed_postgres_migration_failed",
                    "Failed to migrate managed Postgres schema",
                    Some(redact_detail(&error.to_string(), &config)),
                )
            })?;
        let vector_installed = read_vector_installed(&mut client, &config)?;
        let found_tables = read_existing_core_tables(&mut client).map_err(|error| {
            DesktopCommandError::new(
                "managed_postgres_migration_schema_check_failed",
                "Failed to inspect managed Postgres schema after migration",
                Some(redact_detail(&error.to_string(), &config)),
            )
        })?;
        let migration_state = mapped_migration_state(vector_installed, &found_tables);
        if migration_state != "applied" {
            let detail = format!(
                "Migration verification failed: vectorInstalled={vector_installed}, coreTablesFound={}",
                found_tables.len()
            );
            let _ = write_migration_state(&paths.migration_file, "failed", &detail);
            return Err(DesktopCommandError::new(
                "managed_postgres_migration_verification_failed",
                "Managed Postgres migration did not produce the required shared schema",
                Some(detail),
            ));
        }
        write_migration_state(
            &paths.migration_file,
            "applied",
            "Managed schema migration applied",
        )
        .map_err(|detail| {
            DesktopCommandError::new(
                "managed_postgres_migration_state_failed",
                "Failed to record managed Postgres migration state",
                Some(detail),
            )
        })?;
        Ok(configured_status(
            &paths,
            &config,
            "ready",
            "Managed Postgres migrated",
            "Managed schema migration applied",
            true,
            read_pid_file(&paths.pid_file).map(|pid| pid.pid),
            read_pid_file(&paths.pid_file).map(|pid| pid.started_at),
        ))
    }

    fn lock_state(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, ManagedPostgresState>, DesktopCommandError> {
        self.inner.lock().map_err(|_| {
            DesktopCommandError::new(
                "managed_postgres_state_unavailable",
                "Managed Postgres state is unavailable",
                None,
            )
        })
    }
}

pub(crate) fn managed_postgres_root(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join(MANAGED_POSTGRES_DIR)
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_managed_postgres_status(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ManagedPostgresManager>,
) -> Result<ManagedPostgresStatus, DesktopCommandError> {
    manager.status(&command_root(&app)?, &bundled_binary_dirs(&app))
}

#[cfg(not(test))]
#[tauri::command]
pub fn initialize_managed_postgres(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ManagedPostgresManager>,
) -> Result<ManagedPostgresStatus, DesktopCommandError> {
    manager.initialize(&command_root(&app)?, &bundled_binary_dirs(&app))
}

#[cfg(not(test))]
#[tauri::command]
pub fn start_managed_postgres(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ManagedPostgresManager>,
) -> Result<ManagedPostgresStatus, DesktopCommandError> {
    manager.start(&command_root(&app)?, &bundled_binary_dirs(&app))
}

#[cfg(not(test))]
#[tauri::command]
pub fn stop_managed_postgres(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ManagedPostgresManager>,
) -> Result<ManagedPostgresStatus, DesktopCommandError> {
    manager.stop(&command_root(&app)?)
}

#[cfg(not(test))]
#[tauri::command]
pub fn migrate_managed_postgres(
    app: tauri::AppHandle,
    manager: tauri::State<'_, ManagedPostgresManager>,
) -> Result<ManagedPostgresStatus, DesktopCommandError> {
    manager.migrate(&command_root(&app)?)
}

#[cfg(not(test))]
fn command_root(app: &tauri::AppHandle) -> Result<PathBuf, DesktopCommandError> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(managed_postgres_root)
        .map_err(|err| {
            DesktopCommandError::new(
                "managed_postgres_app_data_unavailable",
                "Failed to resolve app data directory",
                Some(err.to_string()),
            )
        })
}

#[cfg(not(test))]
fn bundled_binary_dirs(app: &tauri::AppHandle) -> Vec<PathBuf> {
    use tauri::Manager;
    app.path()
        .resource_dir()
        .map(|dir| vec![dir.join("postgres").join("bin"), dir.join("postgres")])
        .unwrap_or_default()
}

fn status_for_paths(
    paths: &ManagedPostgresPaths,
    bundled_dirs: &[PathBuf],
    child: Option<&OwnedManagedPostgres>,
) -> ManagedPostgresStatus {
    let availability = default_availability(bundled_dirs);
    if !availability.available {
        return unavailable_status(paths, availability.reason);
    }
    let Some(config) = read_managed_config(paths).ok().flatten() else {
        return ManagedPostgresStatus {
            state: "placeholder".into(),
            label: "Managed Postgres not initialized".into(),
            detail: "Run initialize_managed_postgres to create the local data directory".into(),
            available: true,
            reason: None,
            configured: false,
            source: None,
            data_dir: Some(paths.data_dir.display().to_string()),
            host: None,
            port: None,
            database: None,
            user: None,
            pid: None,
            started_at: None,
            migration_state: migration_state(paths),
        };
    };
    let pid = child
        .map(|owned| (owned.pid_file.pid, owned.pid_file.started_at.clone()))
        .or_else(|| read_pid_file(&paths.pid_file).map(|pid| (pid.pid, pid.started_at)));
    configured_status(
        paths,
        &config,
        if pid.is_some() { "degraded" } else { "offline" },
        if pid.is_some() {
            "Managed Postgres recorded"
        } else {
            "Managed Postgres offline"
        },
        "Managed Postgres config is available; use read_postgres_status for live schema readiness",
        true,
        pid.as_ref().map(|(pid, _)| *pid),
        pid.map(|(_, started_at)| started_at),
    )
}

fn ensure_config(
    paths: &ManagedPostgresPaths,
) -> Result<ManagedPostgresConnectionConfig, DesktopCommandError> {
    if let Some(config) = read_managed_config(paths).map_err(|detail| {
        DesktopCommandError::new(
            "managed_postgres_config_read_failed",
            "Failed to read managed Postgres config",
            Some(detail),
        )
    })? {
        return Ok(config);
    }
    let config = generated_managed_config(&paths.root);
    write_managed_config(paths, &config).map_err(|detail| {
        DesktopCommandError::new(
            "managed_postgres_config_write_failed",
            "Failed to write managed Postgres config",
            Some(detail),
        )
    })?;
    Ok(config)
}

fn ensure_started_config(
    paths: &ManagedPostgresPaths,
) -> Result<ManagedPostgresConnectionConfig, DesktopCommandError> {
    read_managed_config(paths)
        .map_err(|detail| {
            DesktopCommandError::new(
                "managed_postgres_config_read_failed",
                "Failed to read managed Postgres config",
                Some(detail),
            )
        })?
        .ok_or_else(|| {
            DesktopCommandError::new(
                "managed_postgres_not_initialized",
                "Managed Postgres is not initialized",
                Some("Missing managed connection config".into()),
            )
        })
}

fn default_availability(
    bundled_dirs: &[PathBuf],
) -> crate::managed_postgres_config::ManagedPostgresAvailability {
    let override_dir = env::var("CHEMD_MANAGED_POSTGRES_BIN_DIR")
        .ok()
        .map(PathBuf::from);
    discover_managed_postgres_binaries(override_dir.as_deref(), bundled_dirs)
}

fn running_owned_status(
    state: &mut ManagedPostgresState,
    paths: &ManagedPostgresPaths,
    config: &ManagedPostgresConnectionConfig,
) -> Result<Option<ManagedPostgresStatus>, DesktopCommandError> {
    let Some(owned) = state.child.as_mut() else {
        return Ok(None);
    };
    match owned.child.try_wait() {
        Ok(None) => Ok(Some(configured_status(
            paths,
            config,
            "degraded",
            "Managed Postgres already running",
            "Managed Postgres process is already owned by this app session",
            true,
            Some(owned.pid_file.pid),
            Some(owned.pid_file.started_at.clone()),
        ))),
        Ok(Some(_)) => {
            state.child = None;
            Ok(None)
        }
        Err(err) => Err(DesktopCommandError::io(
            "managed_postgres_status_failed",
            "Failed to inspect managed Postgres process",
            err,
        )),
    }
}

fn stop_guard_status(
    paths: &ManagedPostgresPaths,
    config: Option<&ManagedPostgresConnectionConfig>,
) -> ManagedPostgresStatus {
    let detail = match read_pid_file(&paths.pid_file) {
        Some(pid) if pid_file_owns_data_dir(&pid, &paths.data_dir) => {
            "Recorded managed Postgres pid exists, but this app session does not own a child handle"
        }
        Some(_) => "Refused to stop because the pid file is not owned by this managed data dir",
        None => "Managed Postgres is not running in this app session",
    };
    configured_status(
        paths,
        config.unwrap_or(&default_status_config()),
        "offline",
        "Managed Postgres offline",
        detail,
        config.is_some(),
        None,
        None,
    )
}

fn unavailable_status(
    paths: &ManagedPostgresPaths,
    reason: Option<String>,
) -> ManagedPostgresStatus {
    ManagedPostgresStatus {
        state: "placeholder".into(),
        label: "Managed Postgres unavailable".into(),
        detail: reason
            .clone()
            .unwrap_or_else(|| "Managed PostgreSQL binaries are not available".into()),
        available: false,
        reason,
        configured: false,
        source: None,
        data_dir: Some(paths.data_dir.display().to_string()),
        host: None,
        port: None,
        database: None,
        user: None,
        pid: None,
        started_at: None,
        migration_state: migration_state(paths),
    }
}

fn configured_status(
    paths: &ManagedPostgresPaths,
    config: &ManagedPostgresConnectionConfig,
    state: &str,
    label: &str,
    detail: &str,
    available: bool,
    pid: Option<u32>,
    started_at: Option<String>,
) -> ManagedPostgresStatus {
    ManagedPostgresStatus {
        state: state.into(),
        label: label.into(),
        detail: redact_detail(detail, config),
        available,
        reason: None,
        configured: true,
        source: Some(format!("managed postgres:{}", paths.config_file.display())),
        data_dir: Some(paths.data_dir.display().to_string()),
        host: Some(config.host.clone()),
        port: Some(config.port),
        database: Some(config.database.clone()),
        user: Some(config.user.clone()),
        pid,
        started_at,
        migration_state: migration_state(paths),
    }
}

fn migration_state(paths: &ManagedPostgresPaths) -> String {
    read_migration_state(&paths.migration_file)
        .map(|state| state.state)
        .unwrap_or_else(|| "not_initialized".into())
}

pub(crate) fn mapped_migration_state(vector_installed: bool, found_tables: &[String]) -> String {
    migration_state_from_schema(
        vector_installed,
        schema_ready_from_rows(found_tables),
        found_tables.len(),
    )
}

pub(crate) fn read_existing_core_tables(
    client: &mut Client,
) -> Result<Vec<String>, postgres::Error> {
    let table_names = CORE_SCHEMA_TABLES
        .iter()
        .map(|table| format!("'{table}'"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'public' AND table_name IN ({table_names})"
    );
    client
        .query(&sql, &[])
        .map(|rows| rows.iter().map(|row| row.get(0)).collect())
}

fn read_vector_installed(
    client: &mut Client,
    config: &ManagedPostgresConnectionConfig,
) -> Result<bool, DesktopCommandError> {
    client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')",
            &[],
        )
        .map(|row| row.get(0))
        .map_err(|error| {
            DesktopCommandError::new(
                "managed_postgres_migration_vector_check_failed",
                "Failed to inspect managed Postgres pgvector extension",
                Some(redact_detail(&error.to_string(), config)),
            )
        })
}

fn set_managed_home_env(paths: &ManagedPostgresPaths) {
    env::set_var("CHEMD_MANAGED_POSTGRES_HOME", &paths.root);
    env::set_var("CHEMD_MANAGED_POSTGRES_CONFIG", &paths.config_file);
}

fn wait_for_postgres_accepting_connections(config: &ManagedPostgresConnectionConfig) -> bool {
    let started = Instant::now();
    let maintenance_config =
        config.runtime_config_for_database("postgres", "managed postgres readiness");
    while started.elapsed() < Duration::from_secs(10) {
        if connect(&maintenance_config).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn ensure_managed_database(
    config: &ManagedPostgresConnectionConfig,
) -> Result<(), DesktopCommandError> {
    let maintenance_config =
        config.runtime_config_for_database("postgres", "managed postgres maintenance");
    let mut client = connect(&maintenance_config).map_err(|detail| {
        DesktopCommandError::new(
            "managed_postgres_maintenance_connect_failed",
            "Failed to connect to managed Postgres maintenance database",
            Some(redact_detail(&detail, config)),
        )
    })?;
    let exists: bool = client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)",
            &[&config.database],
        )
        .map_err(|error| {
            DesktopCommandError::new(
                "managed_postgres_database_check_failed",
                "Failed to inspect managed Postgres database",
                Some(redact_detail(&error.to_string(), config)),
            )
        })?
        .get(0);
    if exists {
        return Ok(());
    }
    let sql = format!(
        "CREATE DATABASE {} OWNER {}",
        quote_ident(&config.database),
        quote_ident(&config.user)
    );
    client.batch_execute(&sql).map_err(|error| {
        DesktopCommandError::new(
            "managed_postgres_database_create_failed",
            "Failed to create managed Postgres database",
            Some(redact_detail(&error.to_string(), config)),
        )
    })
}

fn quote_ident(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn redact_detail(detail: &str, config: &ManagedPostgresConnectionConfig) -> String {
    detail
        .replace(&config.database_url(), "<redacted-managed-postgres-url>")
        .replace(&config.password, "<redacted>")
}

fn default_status_config() -> ManagedPostgresConnectionConfig {
    ManagedPostgresConnectionConfig {
        host: "127.0.0.1".into(),
        port: 0,
        database: "chemd_desktop".into(),
        user: "chemd_desktop".into(),
        password: String::new(),
        created_at: String::new(),
    }
}
