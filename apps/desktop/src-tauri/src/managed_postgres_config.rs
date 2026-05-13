#![cfg_attr(test, allow(dead_code))]

use crate::postgres_config::{EnvSource, PostgresRuntimeConfig};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) const MANAGED_POSTGRES_OWNER: &str = "chemd-desktop-managed-postgres/v1";
pub(crate) const MANAGED_POSTGRES_DIR: &str = "postgres";
const CONFIG_FILE: &str = "connection.json";
const DATA_DIR: &str = "data";
const RUN_DIR: &str = "run";
const MIGRATION_FILE: &str = "migration-state.json";
const PID_FILE: &str = "managed-postgres.pid.json";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManagedPostgresPaths {
    pub(crate) root: PathBuf,
    pub(crate) data_dir: PathBuf,
    pub(crate) run_dir: PathBuf,
    pub(crate) config_file: PathBuf,
    pub(crate) migration_file: PathBuf,
    pub(crate) pid_file: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedPostgresConnectionConfig {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) user: String,
    pub(crate) password: String,
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManagedPostgresBinaries {
    pub(crate) initdb: PathBuf,
    pub(crate) postgres: Option<PathBuf>,
    pub(crate) pg_ctl: Option<PathBuf>,
    pub(crate) psql: PathBuf,
    pub(crate) source: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ManagedPostgresAvailability {
    pub(crate) available: bool,
    pub(crate) reason: Option<String>,
    pub(crate) binaries: Option<ManagedPostgresBinaries>,
}

impl ManagedPostgresPaths {
    pub(crate) fn for_root(root: &Path) -> Self {
        Self {
            root: root.into(),
            data_dir: root.join(DATA_DIR),
            run_dir: root.join(RUN_DIR),
            config_file: root.join(CONFIG_FILE),
            migration_file: root.join(MIGRATION_FILE),
            pid_file: root.join(PID_FILE),
        }
    }
}

impl ManagedPostgresConnectionConfig {
    pub(crate) fn database_url(&self) -> String {
        format!(
            "postgres://{}:{}@{}:{}/{}",
            self.user, self.password, self.host, self.port, self.database
        )
    }

    pub(crate) fn runtime_config(&self, source: &str) -> PostgresRuntimeConfig {
        self.runtime_config_for_database(&self.database, source)
    }

    pub(crate) fn runtime_config_for_database(
        &self,
        database: &str,
        source: &str,
    ) -> PostgresRuntimeConfig {
        let database_url = format!(
            "postgres://{}:{}@{}:{}/{}",
            self.user, self.password, self.host, self.port, database
        );
        PostgresRuntimeConfig {
            database_url,
            source: source.into(),
            host: Some(self.host.clone()),
            database: Some(database.into()),
            user: Some(self.user.clone()),
            password: Some(self.password.clone()),
            ssl: "disable".into(),
            timeout_ms: 5_000,
            pool: Some("managed-local".into()),
        }
    }
}

pub(crate) fn create_managed_paths(root: &Path) -> Result<ManagedPostgresPaths, std::io::Error> {
    let paths = ManagedPostgresPaths::for_root(root);
    fs::create_dir_all(&paths.root)?;
    fs::create_dir_all(&paths.run_dir)?;
    Ok(paths)
}

pub(crate) fn read_managed_config(
    paths: &ManagedPostgresPaths,
) -> Result<Option<ManagedPostgresConnectionConfig>, String> {
    if !paths.config_file.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&paths.config_file).map_err(|err| err.to_string())?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|err| err.to_string())
}

pub(crate) fn write_managed_config(
    paths: &ManagedPostgresPaths,
    config: &ManagedPostgresConnectionConfig,
) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config).map_err(|err| err.to_string())?;
    fs::write(&paths.config_file, content).map_err(|err| err.to_string())
}

pub(crate) fn generated_managed_config(root: &Path) -> ManagedPostgresConnectionConfig {
    let seed = entropy_seed(root);
    ManagedPostgresConnectionConfig {
        host: "127.0.0.1".into(),
        port: generated_port(seed),
        database: "chemd_desktop".into(),
        user: "chemd_desktop".into(),
        password: generated_password(seed),
        created_at: unix_timestamp_ms(),
    }
}

pub(crate) fn managed_env_source(paths: &ManagedPostgresPaths) -> Option<EnvSource> {
    let config = read_managed_config(paths).ok().flatten()?;
    let mut vars = BTreeMap::new();
    vars.insert("CHEMD_POSTGRES_DATABASE_URL".into(), config.database_url());
    Some(EnvSource {
        label: format!("managed postgres:{}", paths.config_file.display()),
        vars,
    })
}

pub(crate) fn managed_config_candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = env::var("CHEMD_MANAGED_POSTGRES_HOME") {
        roots.push(PathBuf::from(home));
    }
    if let Ok(config_file) = env::var("CHEMD_MANAGED_POSTGRES_CONFIG") {
        if let Some(parent) = Path::new(&config_file).parent() {
            roots.push(parent.into());
        }
    }
    if let Ok(app_data) = env::var("APPDATA") {
        roots.push(
            Path::new(&app_data)
                .join("dev.chemd.desktop")
                .join(MANAGED_POSTGRES_DIR),
        );
        roots.push(
            Path::new(&app_data)
                .join("Chemd Desktop IDE")
                .join(MANAGED_POSTGRES_DIR),
        );
    }
    if let Ok(xdg) = env::var("XDG_DATA_HOME") {
        roots.push(
            Path::new(&xdg)
                .join("dev.chemd.desktop")
                .join(MANAGED_POSTGRES_DIR),
        );
    }
    roots
}

pub(crate) fn discover_managed_postgres_binaries(
    dev_override: Option<&Path>,
    bundled_dirs: &[PathBuf],
) -> ManagedPostgresAvailability {
    let mut candidates = Vec::new();
    if let Some(dir) = dev_override {
        candidates.push((
            dir.to_path_buf(),
            "CHEMD_MANAGED_POSTGRES_BIN_DIR".to_string(),
        ));
    }
    for dir in bundled_dirs {
        candidates.push((dir.clone(), "bundled PostgreSQL binaries".to_string()));
    }

    if candidates.is_empty() {
        return ManagedPostgresAvailability::unavailable(
            "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries",
        );
    }

    for (dir, source) in candidates {
        if let Some(binaries) = binaries_from_dir(&dir, &source) {
            return ManagedPostgresAvailability {
                available: true,
                reason: None,
                binaries: Some(binaries),
            };
        }
    }
    ManagedPostgresAvailability::unavailable(
        "PostgreSQL binaries are missing initdb, psql, and postgres or pg_ctl",
    )
}

impl ManagedPostgresAvailability {
    fn unavailable(reason: &str) -> Self {
        Self {
            available: false,
            reason: Some(reason.into()),
            binaries: None,
        }
    }
}

fn binaries_from_dir(dir: &Path, source: &str) -> Option<ManagedPostgresBinaries> {
    let initdb = executable_in_dir(dir, "initdb")?;
    let psql = executable_in_dir(dir, "psql")?;
    let postgres = executable_in_dir(dir, "postgres");
    let pg_ctl = executable_in_dir(dir, "pg_ctl");
    if postgres.is_none() && pg_ctl.is_none() {
        return None;
    }
    Some(ManagedPostgresBinaries {
        initdb,
        postgres,
        pg_ctl,
        psql,
        source: source.into(),
    })
}

fn executable_in_dir(dir: &Path, name: &str) -> Option<PathBuf> {
    let plain = dir.join(name);
    if plain.is_file() {
        return Some(plain);
    }
    #[cfg(windows)]
    {
        let exe = dir.join(format!("{name}.exe"));
        if exe.is_file() {
            return Some(exe);
        }
    }
    None
}

fn generated_port(seed: u64) -> u16 {
    15_432 + (seed % 10_000) as u16
}

fn generated_password(seed: u64) -> String {
    format!("chemd_{seed:016x}_{}", std::process::id())
}

fn entropy_seed(root: &Path) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    root.hash(&mut hasher);
    unix_timestamp_ms().hash(&mut hasher);
    std::process::id().hash(&mut hasher);
    hasher.finish()
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
