use crate::local_store::{list_local_outbox_impl, save_local_runtime_snapshot_impl};
use crate::local_store_sync::{sync_local_outbox_to_postgres_with_target, target_kind};
use crate::local_store_types::{
    LocalOutboxSyncTargetKind, LocalOutboxSyncTargetSummary, LocalRuntimeSnapshotInput,
    LocalSyncStatus,
};
use crate::postgres_runtime_types::{
    PersistRuntimeGraphRagCounts, PersistRuntimeGraphRagResult, PostgresTargetSummary,
};
use crate::workspace::DesktopCommandError;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

struct TestStore {
    root: PathBuf,
}

impl TestStore {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("chemd-local-store-sync-{name}-{suffix}"));
        fs::create_dir_all(&root).expect("test local store should be created");
        Self { root }
    }
}

impl Drop for TestStore {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn sync_local_outbox_persists_pending_entries_and_marks_synced() {
    let store = TestStore::new("success");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input(
            "local-sync",
            "idem-sync",
            valid_runtime_payload("graph-sync"),
        ),
    )
    .expect("snapshot should save");
    let mut persisted = Vec::new();

    let result = sync_local_outbox_to_postgres_with_target(&store.root, sync_target(), |records| {
        persisted.push(records.graph_snapshot.graph_snapshot_id.clone());
        Ok(persist_success(&records.graph_snapshot.graph_snapshot_id))
    })
    .expect("sync should succeed");

    assert_eq!(persisted, vec!["graph-sync"]);
    assert_eq!(result.state, "ready");
    assert_eq!(result.synced_count, 1);
    assert_eq!(result.failed_count, 0);
    assert_eq!(result.skipped_count, 0);
    assert_eq!(result.entries[0].sync_status, LocalSyncStatus::Synced);
    assert_eq!(
        result.entries[0].graph_snapshot_id.as_deref(),
        Some("graph-sync")
    );
    assert!(result.entries[0].error.is_none());
    assert!(matches!(
        result.target.kind,
        LocalOutboxSyncTargetKind::External
    ));
    assert_eq!(result.target.host.as_deref(), Some("db.local"));

    let entries = list_local_outbox_impl(&store.root, None, None).expect("outbox should list");
    assert_eq!(entries[0].sync_status, LocalSyncStatus::Synced);
    assert_eq!(entries[0].failure_count, 0);
    assert!(entries[0].last_error.is_none());
    assert!(entries[0].synced_at.is_some());
}

#[test]
fn sync_local_outbox_keeps_payload_and_bounds_error_on_failure() {
    let store = TestStore::new("failure");
    let payload = valid_runtime_payload("graph-fail");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-fail", "idem-fail", payload.clone()),
    )
    .expect("snapshot should save");

    let result = sync_local_outbox_to_postgres_with_target(&store.root, sync_target(), |_| {
        Err(DesktopCommandError::new(
            "postgres_runtime_persist_failed",
            "Failed to persist runtime Graph/RAG records",
            Some("x".repeat(800)),
        ))
    })
    .expect("sync summary should return failed entry");

    assert_eq!(result.state, "degraded");
    assert_eq!(result.synced_count, 0);
    assert_eq!(result.failed_count, 1);
    assert_eq!(result.target.host.as_deref(), Some("db.local"));
    assert_eq!(result.entries[0].sync_status, LocalSyncStatus::Failed);
    assert_eq!(
        result.entries[0].graph_snapshot_id.as_deref(),
        Some("graph-fail")
    );
    assert!(result.entries[0].error.as_ref().unwrap().len() <= 500);

    let entries = list_local_outbox_impl(&store.root, None, None).expect("outbox should list");
    assert_eq!(entries[0].sync_status, LocalSyncStatus::Failed);
    assert_eq!(entries[0].failure_count, 1);
    assert_eq!(entries[0].payload, payload);
}

#[test]
fn sync_local_outbox_skips_non_pending_entries_without_persisting() {
    let store = TestStore::new("skipped");
    write_outbox(
        &store.root,
        json!({
            "entries": [
                sync_outbox_entry("local-synced", "idem-synced", "synced", "graph-synced"),
                sync_outbox_entry("local-failed", "idem-failed", "failed", "graph-failed")
            ]
        }),
    );

    let result = sync_local_outbox_to_postgres_with_target(&store.root, sync_target(), |_| {
        panic!("non-pending entries should not be persisted")
    })
    .expect("sync should skip non-pending entries");

    assert_eq!(result.synced_count, 0);
    assert_eq!(result.failed_count, 0);
    assert_eq!(result.skipped_count, 2);
    assert_eq!(result.entries[0].sync_status, LocalSyncStatus::Synced);
    assert_eq!(
        result.entries[0].graph_snapshot_id.as_deref(),
        Some("graph-synced")
    );
    assert_eq!(result.entries[1].sync_status, LocalSyncStatus::Failed);
    assert_eq!(result.entries[1].error.as_deref(), Some("previous failure"));
}

#[test]
fn sync_target_kind_detects_managed_postgres_sources() {
    assert!(matches!(
        target_kind("managed postgres:C:\\chemd\\postgres.conf:CHEMD_POSTGRES_DATABASE_URL"),
        LocalOutboxSyncTargetKind::Managed
    ));
    assert!(matches!(
        target_kind("process env:CHEMD_POSTGRES_DATABASE_URL"),
        LocalOutboxSyncTargetKind::External
    ));
}

fn snapshot_input(
    local_id: &str,
    idempotency_key: &str,
    payload: serde_json::Value,
) -> LocalRuntimeSnapshotInput {
    LocalRuntimeSnapshotInput {
        local_id: local_id.into(),
        idempotency_key: idempotency_key.into(),
        payload,
        metadata: json!({ "localStoreKind": "runtime_graph_rag_snapshot" }),
        created_at: "2026-05-12T09:00:00.000Z".into(),
    }
}

fn sync_outbox_entry(
    local_id: &str,
    idempotency_key: &str,
    sync_status: &str,
    graph_snapshot_id: &str,
) -> serde_json::Value {
    json!({
        "localId": local_id,
        "idempotencyKey": idempotency_key,
        "createdAt": "1",
        "syncStatus": sync_status,
        "payload": valid_runtime_payload(graph_snapshot_id),
        "metadata": { "localStoreKind": "runtime_graph_rag_snapshot" },
        "failureCount": if sync_status == "failed" { 1 } else { 0 },
        "lastError": if sync_status == "failed" { Some("previous failure") } else { None },
        "updatedAt": "2",
        "syncedAt": if sync_status == "synced" { Some("2") } else { None }
    })
}

fn valid_runtime_payload(graph_snapshot_id: &str) -> serde_json::Value {
    json!({
        "graphSnapshot": {
            "graphSnapshotId": graph_snapshot_id,
            "experimentId": "exp-1",
            "sourceRevisionIds": ["rev-1"],
            "graphKind": "reaction",
            "nodeCount": 0,
            "edgeCount": 0,
            "createdAt": "2026-05-12T00:00:00Z"
        },
        "nodes": [],
        "edges": [],
        "citationCandidates": [],
        "agentRuns": [],
        "agentToolCalls": [],
        "patchProposals": [],
        "metadata": { "source": "test" },
        "createdAt": "2026-05-12T00:00:00Z"
    })
}

fn persist_success(graph_snapshot_id: &str) -> PersistRuntimeGraphRagResult {
    PersistRuntimeGraphRagResult {
        state: "ready".into(),
        label: "Runtime persisted".into(),
        detail: "Persisted runtime Graph/RAG records to db.local/chemd as chemd".into(),
        graph_snapshot_id: graph_snapshot_id.into(),
        experiment_id: "exp-1".into(),
        counts: PersistRuntimeGraphRagCounts {
            snapshots: 1,
            nodes: 0,
            edges: 0,
            citations: 0,
            agent_runs: 0,
            agent_tool_calls: 0,
            patch_proposals: 0,
        },
        target: PostgresTargetSummary {
            source: "test".into(),
            host: Some("db.local".into()),
            database: Some("chemd".into()),
            user: Some("chemd".into()),
            ssl: "disable".into(),
            timeout_ms: 1000,
            pool: None,
        },
    }
}

fn sync_target() -> LocalOutboxSyncTargetSummary {
    LocalOutboxSyncTargetSummary {
        kind: LocalOutboxSyncTargetKind::External,
        source: "CHEMD_POSTGRES_DATABASE_URL".into(),
        host: Some("db.local".into()),
        database: Some("chemd".into()),
        user: Some("chemd".into()),
        ssl: "disable".into(),
        timeout_ms: 5000,
        pool: Some("external".into()),
    }
}

fn write_outbox(root: &PathBuf, file: serde_json::Value) {
    fs::write(
        root.join("outbox.json"),
        serde_json::to_string_pretty(&file).expect("test outbox should serialize"),
    )
    .expect("test outbox should write");
}
