#![cfg_attr(test, allow(dead_code))]

use crate::managed_postgres_config::{
    ManagedPostgresBinaries, ManagedPostgresConnectionConfig, ManagedPostgresPaths,
    MANAGED_POSTGRES_OWNER,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedPostgresPidFile {
    pub(crate) owner: String,
    pub(crate) pid: u32,
    pub(crate) data_dir: String,
    pub(crate) started_at: String,
}

pub(crate) fn spawn_postgres(
    binaries: &ManagedPostgresBinaries,
    paths: &ManagedPostgresPaths,
    config: &ManagedPostgresConnectionConfig,
) -> Result<Child, String> {
    let Some(postgres) = &binaries.postgres else {
        return Err("postgres binary is required for owned process start".into());
    };
    Command::new(postgres)
        .arg("-D")
        .arg(&paths.data_dir)
        .arg("-h")
        .arg(&config.host)
        .arg("-p")
        .arg(config.port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| err.to_string())
}

pub(crate) fn run_initdb(
    binaries: &ManagedPostgresBinaries,
    paths: &ManagedPostgresPaths,
    config: &ManagedPostgresConnectionConfig,
) -> Result<(), String> {
    let pwfile = paths.run_dir.join("postgres.pw");
    fs::write(&pwfile, &config.password).map_err(|err| err.to_string())?;
    let output = Command::new(&binaries.initdb)
        .arg("-D")
        .arg(&paths.data_dir)
        .arg("-U")
        .arg(&config.user)
        .arg("--encoding=UTF8")
        .arg("--auth-host=scram-sha-256")
        .arg("--auth-local=trust")
        .arg("--pwfile")
        .arg(&pwfile)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|err| err.to_string());
    let _ = fs::remove_file(&pwfile);
    let output = output?;
    if output.status.success() {
        return Ok(());
    }
    Err(command_failure("initdb", &output.stderr))
}

pub(crate) fn read_pid_file(path: &Path) -> Option<ManagedPostgresPidFile> {
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

pub(crate) fn write_pid_file(
    paths: &ManagedPostgresPaths,
    pid: u32,
) -> Result<ManagedPostgresPidFile, String> {
    let file = ManagedPostgresPidFile {
        owner: MANAGED_POSTGRES_OWNER.into(),
        pid,
        data_dir: paths.data_dir.display().to_string(),
        started_at: unix_timestamp_ms(),
    };
    let content = serde_json::to_string_pretty(&file).map_err(|err| err.to_string())?;
    fs::write(&paths.pid_file, content).map_err(|err| err.to_string())?;
    Ok(file)
}

pub(crate) fn pid_file_owns_data_dir(pid_file: &ManagedPostgresPidFile, data_dir: &Path) -> bool {
    pid_file.owner == MANAGED_POSTGRES_OWNER
        && same_path(&PathBuf::from(&pid_file.data_dir), data_dir)
}

pub(crate) fn pg_version_exists(paths: &ManagedPostgresPaths) -> bool {
    paths.data_dir.join("PG_VERSION").is_file()
}

pub(crate) fn remove_pid_file(paths: &ManagedPostgresPaths) {
    let _ = fs::remove_file(&paths.pid_file);
}

fn command_failure(command: &str, stderr: &[u8]) -> String {
    let detail = String::from_utf8_lossy(stderr);
    let trimmed = detail.trim();
    if trimmed.is_empty() {
        format!("{command} failed without stderr")
    } else {
        format!("{command} failed: {trimmed}")
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left = fs::canonicalize(left).unwrap_or_else(|_| left.to_path_buf());
    let right = fs::canonicalize(right).unwrap_or_else(|_| right.to_path_buf());
    left == right
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
