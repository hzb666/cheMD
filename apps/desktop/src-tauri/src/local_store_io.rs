#![cfg_attr(test, allow(dead_code))]

use crate::{
    local_store_time::unix_timestamp_ms,
    local_store_types::{
        LocalOutboxFile, LocalReactionIntelligenceArtifactFile, LocalSnapshotFile,
    },
    workspace::DesktopCommandError,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

const SNAPSHOT_FILE: &str = "runtime-snapshot.json";
const OUTBOX_FILE: &str = "outbox.json";
const REACTION_INTELLIGENCE_ARTIFACTS_FILE: &str = "reaction-intelligence-artifacts.json";

pub(crate) fn read_outbox_file(root: &Path) -> Result<LocalOutboxFile, DesktopCommandError> {
    read_json_file(&outbox_path(root)).map(|file| file.unwrap_or_default())
}

pub(crate) fn read_reaction_intelligence_artifacts_file(
    root: &Path,
) -> Result<LocalReactionIntelligenceArtifactFile, DesktopCommandError> {
    read_json_file(&reaction_intelligence_artifacts_path(root)).map(|file| file.unwrap_or_default())
}

pub(crate) fn read_snapshot_file(root: &Path) -> Option<LocalSnapshotFile> {
    read_json_file(&snapshot_path(root)).ok().flatten()
}

pub(crate) fn write_snapshot_file(
    root: &Path,
    snapshot: &LocalSnapshotFile,
) -> Result<(), DesktopCommandError> {
    write_json_file(&snapshot_path(root), snapshot)
}

pub(crate) fn write_outbox_file(
    root: &Path,
    outbox: &LocalOutboxFile,
) -> Result<(), DesktopCommandError> {
    write_json_file(&outbox_path(root), outbox)
}

pub(crate) fn write_reaction_intelligence_artifacts_file(
    root: &Path,
    file: &LocalReactionIntelligenceArtifactFile,
) -> Result<(), DesktopCommandError> {
    write_json_file(&reaction_intelligence_artifacts_path(root), file)
}

fn read_json_file<T>(path: &Path) -> Result<Option<T>, DesktopCommandError>
where
    T: for<'de> Deserialize<'de>,
{
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(|err| {
        DesktopCommandError::io(
            "local_store_read_failed",
            "Failed to read local store file",
            err,
        )
    })?;
    serde_json::from_str(&content).map(Some).map_err(|err| {
        DesktopCommandError::new(
            "local_store_parse_failed",
            "Failed to parse local store file",
            Some(err.to_string()),
        )
    })
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), DesktopCommandError> {
    let parent = path
        .parent()
        .ok_or_else(|| invalid_path("local store path has no parent"))?;
    fs::create_dir_all(parent).map_err(|err| {
        DesktopCommandError::io(
            "local_store_create_dir_failed",
            "Failed to create local store directory",
            err,
        )
    })?;
    let content = serde_json::to_vec_pretty(value).map_err(|err| {
        DesktopCommandError::new(
            "local_store_serialize_failed",
            "Failed to serialize local store file",
            Some(err.to_string()),
        )
    })?;
    let tmp_path = temp_path(path);
    fs::write(&tmp_path, content).map_err(|err| {
        DesktopCommandError::io(
            "local_store_write_failed",
            "Failed to write local store file",
            err,
        )
    })?;
    rename_tmp_file(&tmp_path, path)
}

fn rename_tmp_file(tmp_path: &Path, path: &Path) -> Result<(), DesktopCommandError> {
    match fs::rename(tmp_path, path) {
        Ok(()) => Ok(()),
        Err(_) if path.exists() => replace_existing_file(tmp_path, path),
        Err(err) => {
            let _ = fs::remove_file(tmp_path);
            Err(DesktopCommandError::new(
                "local_store_rename_failed",
                "Failed to commit local store file",
                Some(format!("{} while renaming {}", err, tmp_path.display())),
            ))
        }
    }
}

fn replace_existing_file(tmp_path: &Path, path: &Path) -> Result<(), DesktopCommandError> {
    fs::remove_file(path).map_err(|err| {
        DesktopCommandError::io(
            "local_store_replace_failed",
            "Failed to replace local store file",
            err,
        )
    })?;
    fs::rename(tmp_path, path).map_err(|err| {
        DesktopCommandError::new(
            "local_store_rename_failed",
            "Failed to commit local store file",
            Some(err.to_string()),
        )
    })
}

fn temp_path(path: &Path) -> PathBuf {
    path.with_file_name(format!(
        "{}.tmp-{}-{}",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("store"),
        std::process::id(),
        unix_timestamp_ms()
    ))
}

fn snapshot_path(root: &Path) -> PathBuf {
    root.join(SNAPSHOT_FILE)
}

fn outbox_path(root: &Path) -> PathBuf {
    root.join(OUTBOX_FILE)
}

fn reaction_intelligence_artifacts_path(root: &Path) -> PathBuf {
    root.join(REACTION_INTELLIGENCE_ARTIFACTS_FILE)
}

fn invalid_path(detail: &str) -> DesktopCommandError {
    DesktopCommandError::new(
        "local_store_invalid_input",
        "Invalid local store input",
        Some(detail.into()),
    )
}
