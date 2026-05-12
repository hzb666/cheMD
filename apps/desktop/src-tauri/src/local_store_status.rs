#![cfg_attr(test, allow(dead_code))]

use crate::{
    local_store_io::read_snapshot_file,
    local_store_types::{
        LocalOutboxFile, LocalOutboxMutationResult, LocalStoreStatus, LocalSyncStatus,
    },
};
use std::path::Path;

pub(crate) fn status_from_outbox(root: &Path, outbox: &LocalOutboxFile) -> LocalStoreStatus {
    let pending = count_status(outbox, LocalSyncStatus::Pending);
    let synced = count_status(outbox, LocalSyncStatus::Synced);
    let failed = count_status(outbox, LocalSyncStatus::Failed);
    let last_saved_at = read_snapshot_file(root).map(|snapshot| snapshot.saved_at);
    let last_synced_at = outbox
        .entries
        .iter()
        .filter_map(|entry| entry.synced_at.as_ref())
        .max()
        .cloned();
    let (state, label, detail) = status_text(pending, synced, failed, last_saved_at.is_some());
    LocalStoreStatus {
        available: true,
        storage_path: root.display().to_string(),
        outbox_pending_count: pending,
        outbox_failed_count: failed,
        last_saved_at,
        last_synced_at,
        state,
        label,
        detail,
    }
}

pub(crate) fn mutation_result(
    updated: usize,
    outbox: &LocalOutboxFile,
) -> LocalOutboxMutationResult {
    LocalOutboxMutationResult {
        updated,
        outbox_pending_count: count_status(outbox, LocalSyncStatus::Pending),
        outbox_failed_count: count_status(outbox, LocalSyncStatus::Failed),
    }
}

pub(crate) fn count_status(outbox: &LocalOutboxFile, status: LocalSyncStatus) -> usize {
    outbox
        .entries
        .iter()
        .filter(|entry| entry.sync_status == status)
        .count()
}

fn status_text(
    pending: usize,
    synced: usize,
    failed: usize,
    has_snapshot: bool,
) -> (String, String, String) {
    if failed > 0 {
        return (
            "degraded".into(),
            "Local outbox has failures".into(),
            "Failed local entries are retained without exposing payload data".into(),
        );
    }
    if pending > 0 {
        return (
            "ready".into(),
            "Local outbox pending".into(),
            "Local runtime snapshots are saved and waiting for sync".into(),
        );
    }
    if synced > 0 || has_snapshot {
        return (
            "ready".into(),
            "Local store synced".into(),
            "Local runtime snapshots are saved with no pending failures".into(),
        );
    }
    (
        "placeholder".into(),
        "Local store empty".into(),
        "No local runtime snapshots have been saved yet".into(),
    )
}
