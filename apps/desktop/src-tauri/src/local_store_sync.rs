#![cfg_attr(test, allow(dead_code))]

use crate::{
    local_store::read_local_store_status_impl,
    local_store_io::{read_outbox_file, write_outbox_file},
    local_store_time::unix_timestamp_ms,
    local_store_types::{
        LocalOutboxRecord, LocalOutboxSyncEntryResult, LocalOutboxSyncResult,
        LocalOutboxSyncTargetKind, LocalOutboxSyncTargetSummary, LocalSyncStatus,
    },
    postgres_config::{load_postgres_config, PostgresRuntimeConfig},
    postgres_runtime_persist::persist_runtime_graph_rag_impl,
    postgres_runtime_types::{PersistRuntimeGraphRagInput, PersistRuntimeGraphRagResult},
    workspace::DesktopCommandError,
};
use std::path::Path;
#[cfg(not(test))]
use std::path::PathBuf;

const MAX_LAST_ERROR_CHARS: usize = 500;

#[cfg(not(test))]
#[tauri::command]
pub async fn sync_local_outbox_to_postgres(
    app: tauri::AppHandle,
) -> Result<LocalOutboxSyncResult, DesktopCommandError> {
    match tauri::async_runtime::spawn_blocking(move || {
        sync_local_outbox_to_postgres_impl(&command_root(&app)?)
    })
    .await
    {
        Ok(result) => result,
        Err(error) => Err(DesktopCommandError::new(
            "local_outbox_sync_task_failed",
            "Local outbox sync task failed",
            Some(error.to_string()),
        )),
    }
}

pub(crate) fn sync_local_outbox_to_postgres_impl(
    root: &Path,
) -> Result<LocalOutboxSyncResult, DesktopCommandError> {
    let target = load_sync_target()?;
    sync_local_outbox_to_postgres_with_target(root, target, persist_runtime_graph_rag_impl)
}

pub(crate) fn sync_local_outbox_to_postgres_with_target<F>(
    root: &Path,
    target: LocalOutboxSyncTargetSummary,
    mut persist: F,
) -> Result<LocalOutboxSyncResult, DesktopCommandError>
where
    F: FnMut(
        PersistRuntimeGraphRagInput,
    ) -> Result<PersistRuntimeGraphRagResult, DesktopCommandError>,
{
    let mut outbox = read_outbox_file(root)?;
    let mut synced_count = 0;
    let mut failed_count = 0;
    let mut skipped_count = 0;
    let mut changed = false;
    let mut entries = Vec::with_capacity(outbox.entries.len());

    for record in &mut outbox.entries {
        let graph_snapshot_id = graph_snapshot_id(record);
        if record.sync_status != LocalSyncStatus::Pending {
            skipped_count += 1;
            entries.push(entry_result(record, graph_snapshot_id));
            continue;
        }

        match parse_and_persist(record, &mut persist) {
            Ok(_) => {
                mark_synced(record);
                synced_count += 1;
                changed = true;
            }
            Err(error) => {
                mark_failed(record, bounded_error(&error));
                failed_count += 1;
                changed = true;
            }
        }
        entries.push(entry_result(record, graph_snapshot_id));
    }

    if changed {
        write_outbox_file(root, &outbox)?;
    }

    Ok(sync_result(
        root,
        target,
        synced_count,
        failed_count,
        skipped_count,
        entries,
    ))
}

fn parse_and_persist<F>(
    record: &LocalOutboxRecord,
    persist: &mut F,
) -> Result<PersistRuntimeGraphRagResult, DesktopCommandError>
where
    F: FnMut(
        PersistRuntimeGraphRagInput,
    ) -> Result<PersistRuntimeGraphRagResult, DesktopCommandError>,
{
    let payload = serde_json::from_value::<PersistRuntimeGraphRagInput>(record.payload.clone())
        .map_err(|error| {
            DesktopCommandError::new(
                "local_outbox_payload_invalid",
                "Local outbox payload does not match runtime persistence input",
                Some(error.to_string()),
            )
        })?;
    persist(payload)
}

fn mark_synced(record: &mut LocalOutboxRecord) {
    let synced_at = unix_timestamp_ms();
    record.sync_status = LocalSyncStatus::Synced;
    record.failure_count = 0;
    record.last_error = None;
    record.updated_at = synced_at.clone();
    record.synced_at = Some(synced_at);
}

fn mark_failed(record: &mut LocalOutboxRecord, error: String) {
    let updated_at = unix_timestamp_ms();
    record.sync_status = LocalSyncStatus::Failed;
    record.failure_count = record.failure_count.saturating_add(1);
    record.last_error = Some(error);
    record.updated_at = updated_at;
    record.synced_at = None;
}

fn entry_result(
    record: &LocalOutboxRecord,
    graph_snapshot_id: Option<String>,
) -> LocalOutboxSyncEntryResult {
    LocalOutboxSyncEntryResult {
        local_id: record.local_id.clone(),
        idempotency_key: record.idempotency_key.clone(),
        sync_status: record.sync_status.clone(),
        graph_snapshot_id,
        error: record.last_error.clone(),
    }
}

fn bounded_error(error: &DesktopCommandError) -> String {
    let detail = error
        .detail
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&error.message);
    truncate_chars(&format!("{}: {}", error.code, detail), MAX_LAST_ERROR_CHARS)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.into();
    }
    value.chars().take(max_chars).collect()
}

fn sync_result(
    root: &Path,
    target: LocalOutboxSyncTargetSummary,
    synced_count: usize,
    failed_count: usize,
    skipped_count: usize,
    entries: Vec<LocalOutboxSyncEntryResult>,
) -> LocalOutboxSyncResult {
    let status = read_local_store_status_impl(root).ok();
    let pending_count = status
        .as_ref()
        .map(|value| value.outbox_pending_count)
        .unwrap_or_default();
    let total = synced_count + failed_count + skipped_count;
    let (state, label, detail) = sync_status_text(total, synced_count, failed_count, pending_count);

    LocalOutboxSyncResult {
        state,
        label,
        detail,
        target,
        synced_count,
        failed_count,
        skipped_count,
        entries,
    }
}

fn load_sync_target() -> Result<LocalOutboxSyncTargetSummary, DesktopCommandError> {
    load_postgres_config()
        .map(|config| target_from_config(&config))
        .ok_or_else(|| {
            DesktopCommandError::new(
                "postgres_config_missing",
                "PostgreSQL is not configured",
                Some(
                    "Set CHEMD_POSTGRES_DATABASE_URL, DATABASE_URL, or initialize managed PostgreSQL before syncing local outbox entries"
                        .into(),
                ),
            )
        })
}

fn target_from_config(config: &PostgresRuntimeConfig) -> LocalOutboxSyncTargetSummary {
    LocalOutboxSyncTargetSummary {
        kind: target_kind(&config.source),
        source: config.source.clone(),
        host: config.host.clone(),
        database: config.database.clone(),
        user: config.user.clone(),
        ssl: config.ssl.clone(),
        timeout_ms: config.timeout_ms,
        pool: config.pool.clone(),
    }
}

pub(crate) fn target_kind(source: &str) -> LocalOutboxSyncTargetKind {
    let normalized = source.to_ascii_lowercase();
    if normalized.starts_with("managed postgres:") || normalized.contains("managed postgres") {
        return LocalOutboxSyncTargetKind::Managed;
    }
    LocalOutboxSyncTargetKind::External
}

fn graph_snapshot_id(record: &LocalOutboxRecord) -> Option<String> {
    record
        .payload
        .get("graphSnapshot")
        .and_then(|value| value.get("graphSnapshotId"))
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(String::from)
}

fn sync_status_text(
    total: usize,
    synced_count: usize,
    failed_count: usize,
    pending_count: usize,
) -> (String, String, String) {
    if failed_count > 0 {
        return (
            "degraded".into(),
            "Local outbox sync failed".into(),
            format!("{failed_count} local outbox entries failed and kept their payloads"),
        );
    }
    if synced_count > 0 {
        return (
            "ready".into(),
            "Local outbox synced".into(),
            format!("{synced_count} local outbox entries synced to PostgreSQL"),
        );
    }
    if total > 0 || pending_count > 0 {
        return (
            "ready".into(),
            "No pending local outbox entries".into(),
            "Local outbox has no pending entries to sync".into(),
        );
    }
    (
        "placeholder".into(),
        "Local outbox empty".into(),
        "No local outbox entries have been saved yet".into(),
    )
}

#[cfg(not(test))]
fn command_root(app: &tauri::AppHandle) -> Result<PathBuf, DesktopCommandError> {
    use crate::local_store::local_store_root;
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(local_store_root)
        .map_err(|err| {
            DesktopCommandError::new(
                "local_store_app_data_unavailable",
                "Failed to resolve app data directory",
                Some(err.to_string()),
            )
        })
}
