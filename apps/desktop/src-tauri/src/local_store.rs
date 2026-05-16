#![cfg_attr(test, allow(dead_code))]

use crate::workspace::CommandError;
use crate::{
    local_store_io::{
        read_outbox_file, read_reaction_intelligence_artifacts_file, write_outbox_file,
        write_reaction_intelligence_artifacts_file, write_snapshot_file,
    },
    local_store_status::{count_status, mutation_result, status_from_outbox},
    local_store_time::unix_timestamp_ms,
    local_store_types::{
        LocalOutboxFile, LocalOutboxMutationResult, LocalOutboxRecord,
        LocalReactionIntelligenceArtifactInput, LocalReactionIntelligenceArtifactRecord,
        LocalReactionIntelligenceArtifactSaveResult, LocalRuntimeSnapshotInput, LocalSnapshotFile,
        LocalSnapshotSaveResult, LocalStoreStatus, LocalSyncStatus,
    },
};
#[cfg(not(test))]
use serde_json::Value;
use std::path::{Path, PathBuf};

const LOCAL_STORE_DIR: &str = "local-store";
const MAX_PAYLOAD_BYTES: usize = 2 * 1024 * 1024;
const MAX_REACTION_INTELLIGENCE_ARTIFACT_BYTES: usize = 8 * 1024 * 1024;
const MAX_OUTBOX_ENTRIES: usize = 500;
const MAX_ARTIFACT_ENTRIES: usize = 200;

#[cfg(not(test))]
#[tauri::command]
pub fn read_local_store_status(app: tauri::AppHandle) -> Result<LocalStoreStatus, CommandError> {
    read_local_store_status_impl(&command_root(&app)?)
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_local_runtime_snapshot(
    app: tauri::AppHandle,
    local_id: String,
    idempotency_key: String,
    payload: Value,
    metadata: Value,
    created_at: String,
) -> Result<LocalSnapshotSaveResult, CommandError> {
    save_local_runtime_snapshot_impl(
        &command_root(&app)?,
        LocalRuntimeSnapshotInput {
            local_id,
            idempotency_key,
            payload,
            metadata,
            created_at,
        },
    )
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_local_reaction_intelligence_artifact(
    app: tauri::AppHandle,
    local_id: String,
    idempotency_key: String,
    artifact: Value,
    metadata: Value,
    created_at: String,
) -> Result<LocalReactionIntelligenceArtifactSaveResult, CommandError> {
    save_local_reaction_intelligence_artifact_impl(
        &command_root(&app)?,
        LocalReactionIntelligenceArtifactInput {
            local_id,
            idempotency_key,
            artifact,
            metadata,
            created_at,
        },
    )
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_local_reaction_intelligence_artifacts(
    app: tauri::AppHandle,
    graph_index_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LocalReactionIntelligenceArtifactRecord>, CommandError> {
    list_local_reaction_intelligence_artifacts_impl(&command_root(&app)?, graph_index_id, limit)
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_local_outbox(
    app: tauri::AppHandle,
    sync_status: Option<LocalSyncStatus>,
    limit: Option<usize>,
) -> Result<Vec<LocalOutboxRecord>, CommandError> {
    list_local_outbox_impl(&command_root(&app)?, sync_status, limit)
}

#[cfg(not(test))]
#[tauri::command]
pub fn mark_local_outbox_synced(
    app: tauri::AppHandle,
    local_ids: Vec<String>,
    synced_at: Option<String>,
) -> Result<LocalOutboxMutationResult, CommandError> {
    mark_local_outbox_synced_impl(&command_root(&app)?, &local_ids, synced_at)
}

#[cfg(not(test))]
#[tauri::command]
pub fn clear_local_outbox_failures(
    app: tauri::AppHandle,
) -> Result<LocalOutboxMutationResult, CommandError> {
    clear_local_outbox_failures_impl(&command_root(&app)?)
}

pub(crate) fn local_store_root(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join(LOCAL_STORE_DIR)
}

pub(crate) fn read_local_store_status_impl(root: &Path) -> Result<LocalStoreStatus, CommandError> {
    let outbox = read_outbox_file(root)?;
    Ok(status_from_outbox(root, &outbox))
}

pub(crate) fn list_local_outbox_impl(
    root: &Path,
    sync_status: Option<LocalSyncStatus>,
    limit: Option<usize>,
) -> Result<Vec<LocalOutboxRecord>, CommandError> {
    let mut entries = read_outbox_file(root)?.entries;
    if let Some(status) = sync_status {
        entries.retain(|entry| entry.sync_status == status);
    }
    if let Some(limit) = limit {
        entries.truncate(limit.min(MAX_OUTBOX_ENTRIES));
    }
    Ok(entries)
}

pub(crate) fn save_local_runtime_snapshot_impl(
    root: &Path,
    input: LocalRuntimeSnapshotInput,
) -> Result<LocalSnapshotSaveResult, CommandError> {
    validate_snapshot_input(&input)?;
    let mut outbox = read_outbox_file(root)?;
    let record = upsert_outbox_record(&mut outbox, input)?;
    let snapshot = LocalSnapshotFile {
        saved_at: record.created_at.clone(),
        local_id: record.local_id.clone(),
        idempotency_key: record.idempotency_key.clone(),
        payload: record.payload.clone(),
        metadata: record.metadata.clone(),
    };
    write_snapshot_file(root, &snapshot)?;
    write_outbox_file(root, &outbox)?;
    let pending = count_status(&outbox, LocalSyncStatus::Pending);
    Ok(LocalSnapshotSaveResult {
        local_id: record.local_id,
        idempotency_key: record.idempotency_key,
        sync_status: record.sync_status,
        created_at: record.created_at,
        outbox_pending_count: pending,
    })
}

pub(crate) fn save_local_reaction_intelligence_artifact_impl(
    root: &Path,
    input: LocalReactionIntelligenceArtifactInput,
) -> Result<LocalReactionIntelligenceArtifactSaveResult, CommandError> {
    validate_reaction_intelligence_artifact_input(&input)?;
    let mut file = read_reaction_intelligence_artifacts_file(root)?;
    let record = upsert_reaction_intelligence_artifact_record(&mut file, input)?;
    write_reaction_intelligence_artifacts_file(root, &file)?;
    Ok(LocalReactionIntelligenceArtifactSaveResult {
        local_id: record.local_id,
        idempotency_key: record.idempotency_key,
        created_at: record.created_at,
        artifact_count: file.entries.len(),
    })
}

pub(crate) fn list_local_reaction_intelligence_artifacts_impl(
    root: &Path,
    graph_index_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<LocalReactionIntelligenceArtifactRecord>, CommandError> {
    let mut entries = read_reaction_intelligence_artifacts_file(root)?.entries;
    if let Some(graph_index_id) = graph_index_id.filter(|value| !value.trim().is_empty()) {
        entries.retain(|entry| {
            entry
                .artifact
                .get("graph_index_id")
                .and_then(|value| value.as_str())
                .is_some_and(|value| value == graph_index_id)
        });
    }
    entries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    if let Some(limit) = limit {
        entries.truncate(limit.min(MAX_ARTIFACT_ENTRIES));
    }
    Ok(entries)
}

pub(crate) fn mark_local_outbox_synced_impl(
    root: &Path,
    local_ids: &[String],
    synced_at: Option<String>,
) -> Result<LocalOutboxMutationResult, CommandError> {
    let ids = normalized_ids(local_ids);
    if ids.is_empty() {
        return Err(invalid_input("localIds is required"));
    }
    let mut outbox = read_outbox_file(root)?;
    let synced_at = synced_at
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(unix_timestamp_ms);
    let mut updated = 0;
    for record in outbox
        .entries
        .iter_mut()
        .filter(|entry| ids.iter().any(|id| id == &entry.local_id))
    {
        record.sync_status = LocalSyncStatus::Synced;
        record.failure_count = 0;
        record.last_error = None;
        record.updated_at = synced_at.clone();
        record.synced_at = Some(synced_at.clone());
        updated += 1;
    }
    if updated == 0 {
        return Err(invalid_input("local outbox entry was not found"));
    }
    write_outbox_file(root, &outbox)?;
    Ok(mutation_result(updated, &outbox))
}

pub(crate) fn clear_local_outbox_failures_impl(
    root: &Path,
) -> Result<LocalOutboxMutationResult, CommandError> {
    let mut outbox = read_outbox_file(root)?;
    let before = outbox.entries.len();
    outbox
        .entries
        .retain(|entry| entry.sync_status != LocalSyncStatus::Failed);
    let cleared = before - outbox.entries.len();
    write_outbox_file(root, &outbox)?;
    Ok(mutation_result(cleared, &outbox))
}

fn upsert_outbox_record(
    outbox: &mut LocalOutboxFile,
    input: LocalRuntimeSnapshotInput,
) -> Result<LocalOutboxRecord, CommandError> {
    if let Some(record) = outbox
        .entries
        .iter_mut()
        .find(|entry| entry.idempotency_key == input.idempotency_key)
    {
        record.payload = input.payload;
        record.metadata = input.metadata;
        record.sync_status = LocalSyncStatus::Pending;
        record.failure_count = 0;
        record.last_error = None;
        record.updated_at = unix_timestamp_ms();
        record.synced_at = None;
        return Ok(record.clone());
    }
    if outbox.entries.len() >= MAX_OUTBOX_ENTRIES {
        return Err(invalid_input("local outbox has reached 500 entries"));
    }
    let record = LocalOutboxRecord {
        local_id: input.local_id,
        idempotency_key: input.idempotency_key,
        created_at: input.created_at.clone(),
        sync_status: LocalSyncStatus::Pending,
        payload: input.payload,
        metadata: input.metadata,
        failure_count: 0,
        last_error: None,
        updated_at: input.created_at,
        synced_at: None,
    };
    outbox.entries.push(record.clone());
    Ok(record)
}

fn upsert_reaction_intelligence_artifact_record(
    file: &mut crate::local_store_types::LocalReactionIntelligenceArtifactFile,
    input: LocalReactionIntelligenceArtifactInput,
) -> Result<LocalReactionIntelligenceArtifactRecord, CommandError> {
    if let Some(record) = file
        .entries
        .iter_mut()
        .find(|entry| entry.idempotency_key == input.idempotency_key)
    {
        record.artifact = input.artifact;
        record.metadata = input.metadata;
        record.updated_at = unix_timestamp_ms();
        return Ok(record.clone());
    }
    if file.entries.len() >= MAX_ARTIFACT_ENTRIES {
        return Err(invalid_input(
            "local artifact store has reached 200 entries",
        ));
    }
    let record = LocalReactionIntelligenceArtifactRecord {
        local_id: input.local_id,
        idempotency_key: input.idempotency_key,
        artifact: input.artifact,
        metadata: input.metadata,
        created_at: input.created_at.clone(),
        updated_at: input.created_at,
    };
    file.entries.push(record.clone());
    Ok(record)
}

fn validate_snapshot_input(input: &LocalRuntimeSnapshotInput) -> Result<(), CommandError> {
    if input.local_id.trim().is_empty() {
        return Err(invalid_input("localId is required"));
    }
    if input.idempotency_key.trim().is_empty() {
        return Err(invalid_input("idempotencyKey is required"));
    }
    if input.created_at.trim().is_empty() {
        return Err(invalid_input("createdAt is required"));
    }
    if !input.metadata.is_object() {
        return Err(invalid_input("metadata must be an object"));
    }
    let bytes = serde_json::to_vec(&input.payload).map_err(|err| {
        CommandError::new(
            "local_store_payload_invalid",
            "Local runtime snapshot payload is invalid",
            Some(err.to_string()),
        )
    })?;
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return Err(invalid_input(&format!(
            "payload is {} bytes; limit is {} bytes",
            bytes.len(),
            MAX_PAYLOAD_BYTES
        )));
    }
    Ok(())
}

fn validate_reaction_intelligence_artifact_input(
    input: &LocalReactionIntelligenceArtifactInput,
) -> Result<(), CommandError> {
    if input.local_id.trim().is_empty() {
        return Err(invalid_input("localId is required"));
    }
    if input.idempotency_key.trim().is_empty() {
        return Err(invalid_input("idempotencyKey is required"));
    }
    if input.created_at.trim().is_empty() {
        return Err(invalid_input("createdAt is required"));
    }
    if !input.metadata.is_object() {
        return Err(invalid_input("metadata must be an object"));
    }
    if !input.artifact.is_object() {
        return Err(invalid_input("artifact must be an object"));
    }
    let bytes = serde_json::to_vec(&input.artifact).map_err(|err| {
        CommandError::new(
            "local_store_artifact_invalid",
            "Local reaction intelligence artifact is invalid",
            Some(err.to_string()),
        )
    })?;
    if bytes.len() > MAX_REACTION_INTELLIGENCE_ARTIFACT_BYTES {
        return Err(invalid_input(&format!(
            "artifact is {} bytes; limit is {} bytes",
            bytes.len(),
            MAX_REACTION_INTELLIGENCE_ARTIFACT_BYTES
        )));
    }
    Ok(())
}

fn normalized_ids(local_ids: &[String]) -> Vec<String> {
    local_ids
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(String::from)
        .collect()
}

fn invalid_input(detail: &str) -> CommandError {
    CommandError::new(
        "local_store_invalid_input",
        "Invalid local store input",
        Some(detail.into()),
    )
}

#[cfg(not(test))]
fn command_root(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(local_store_root)
        .map_err(|err| {
            CommandError::new(
                "local_store_app_data_unavailable",
                "Failed to resolve app data directory",
                Some(err.to_string()),
            )
        })
}
