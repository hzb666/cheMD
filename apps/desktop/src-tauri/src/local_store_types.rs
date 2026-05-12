#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalOutboxRecord {
    pub(crate) local_id: String,
    pub(crate) idempotency_key: String,
    pub(crate) created_at: String,
    pub(crate) sync_status: LocalSyncStatus,
    pub(crate) payload: Value,
    pub(crate) metadata: Value,
    pub(crate) failure_count: u32,
    pub(crate) last_error: Option<String>,
    pub(crate) updated_at: String,
    pub(crate) synced_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LocalSyncStatus {
    Pending,
    Synced,
    Failed,
}

#[derive(Debug, Clone)]
pub(crate) struct LocalRuntimeSnapshotInput {
    pub(crate) local_id: String,
    pub(crate) idempotency_key: String,
    pub(crate) payload: Value,
    pub(crate) metadata: Value,
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalStoreStatus {
    pub(crate) available: bool,
    pub(crate) storage_path: String,
    pub(crate) outbox_pending_count: usize,
    pub(crate) outbox_failed_count: usize,
    pub(crate) last_saved_at: Option<String>,
    pub(crate) last_synced_at: Option<String>,
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalSnapshotSaveResult {
    pub(crate) local_id: String,
    pub(crate) idempotency_key: String,
    pub(crate) sync_status: LocalSyncStatus,
    pub(crate) created_at: String,
    pub(crate) outbox_pending_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalOutboxMutationResult {
    pub(crate) updated: usize,
    pub(crate) outbox_pending_count: usize,
    pub(crate) outbox_failed_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalSnapshotFile {
    pub(crate) saved_at: String,
    pub(crate) local_id: String,
    pub(crate) idempotency_key: String,
    pub(crate) payload: Value,
    pub(crate) metadata: Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalOutboxFile {
    pub(crate) entries: Vec<LocalOutboxRecord>,
}
