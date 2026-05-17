use crate::local_store::{
    clear_local_outbox_failures_impl, list_local_outbox_impl, list_local_outbox_page_impl,
    list_local_reaction_intelligence_artifacts_impl,
    list_local_reaction_intelligence_artifacts_page_impl, mark_local_outbox_synced_impl,
    read_local_store_status_impl, save_local_reaction_intelligence_artifact_impl,
    save_local_runtime_snapshot_impl,
};
use crate::local_store_types::{
    LocalReactionIntelligenceArtifactInput, LocalRuntimeSnapshotInput, LocalSyncStatus,
};
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
        let root = std::env::temp_dir().join(format!("chemd-local-store-{name}-{suffix}"));
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
fn save_snapshot_writes_pending_outbox_and_status() {
    let store = TestStore::new("save");
    let result = save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input(
            "local-one",
            "idem-one",
            json!({
            "graphSnapshot": { "graphSnapshotId": "graph-one" }
            }),
        ),
    )
    .expect("snapshot should save");

    assert_eq!(result.local_id, "local-one");
    assert_eq!(result.idempotency_key, "idem-one");
    assert_eq!(result.sync_status, LocalSyncStatus::Pending);
    assert_eq!(result.outbox_pending_count, 1);

    let status = read_local_store_status_impl(&store.root).expect("status should read");
    assert_eq!(status.outbox_pending_count, 1);
    assert_eq!(status.outbox_failed_count, 0);
    assert_eq!(status.state, "ready");
    assert!(status.last_saved_at.is_some());

    let entries = list_local_outbox_impl(&store.root, None, None).expect("outbox should list");
    assert_eq!(entries.len(), 1);
    assert_eq!(
        entries[0].payload["graphSnapshot"]["graphSnapshotId"],
        "graph-one"
    );
    assert_eq!(
        entries[0].metadata["localStoreKind"],
        "runtime_graph_rag_snapshot"
    );
}

#[test]
fn save_snapshot_upserts_by_idempotency_key() {
    let store = TestStore::new("stable");
    let first = save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-same", "idem-same", json!({ "version": 1 })),
    )
    .expect("first save should work");
    let second = save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-same", "idem-same", json!({ "version": 2 })),
    )
    .expect("second save should upsert");

    assert_eq!(first.local_id, second.local_id);
    assert_eq!(first.idempotency_key, second.idempotency_key);
    let entries = list_local_outbox_impl(&store.root, None, None).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].payload["version"], 2);
}

#[test]
fn save_reaction_intelligence_artifact_upserts_and_lists_by_graph_index() {
    let store = TestStore::new("artifact");
    let first = save_local_reaction_intelligence_artifact_impl(
        &store.root,
        artifact_input("local-artifact", "idem-artifact", "graph-index-one", 0.91),
    )
    .expect("artifact should save");
    let second = save_local_reaction_intelligence_artifact_impl(
        &store.root,
        artifact_input("local-artifact", "idem-artifact", "graph-index-one", 0.84),
    )
    .expect("artifact should upsert");
    save_local_reaction_intelligence_artifact_impl(
        &store.root,
        artifact_input("local-other", "idem-other", "graph-index-two", 0.72),
    )
    .expect("second artifact should save");

    assert_eq!(first.artifact_count, 1);
    assert_eq!(second.artifact_count, 1);

    let filtered = list_local_reaction_intelligence_artifacts_impl(
        &store.root,
        Some("graph-index-one".into()),
        None,
    )
    .expect("artifacts should list");
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].local_id, "local-artifact");
    assert_eq!(
        filtered[0].artifact["similarity_edges"][0]["score"],
        json!(0.84)
    );

    let all = list_local_reaction_intelligence_artifacts_impl(&store.root, None, Some(1))
        .expect("artifact limit should apply");
    assert_eq!(all.len(), 1);
}

#[test]
fn save_snapshot_rejects_payload_over_two_mb() {
    let store = TestStore::new("oversize");
    let error = save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input(
            "local-big",
            "idem-big",
            json!({ "content": "x".repeat(2 * 1024 * 1024 + 1) }),
        ),
    )
    .expect_err("oversized payload should fail");

    assert_eq!(error.code, "local_store_invalid_input");
    assert!(error.detail.unwrap().contains("limit is 2097152 bytes"));
}

#[test]
fn mark_synced_updates_by_local_id_without_deleting_entry() {
    let store = TestStore::new("synced-local");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-sync", "idem-sync", json!({ "value": "sync" })),
    )
    .expect("snapshot should save");

    let result = mark_local_outbox_synced_impl(
        &store.root,
        &[String::from("local-sync")],
        Some("2026-05-12T10:00:00.000Z".into()),
    )
    .expect("entry should mark synced");
    let entries = list_local_outbox_impl(&store.root, None, None).expect("outbox should list");

    assert_eq!(result.updated, 1);
    assert_eq!(result.outbox_pending_count, 0);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].sync_status, LocalSyncStatus::Synced);
    assert_eq!(
        entries[0].synced_at.as_deref(),
        Some("2026-05-12T10:00:00.000Z")
    );
}

#[test]
fn list_outbox_filters_status_and_limits_results() {
    let store = TestStore::new("list");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-a", "idem-a", json!({ "value": "a" })),
    )
    .expect("snapshot should save");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-b", "idem-b", json!({ "value": "b" })),
    )
    .expect("snapshot should save");
    mark_local_outbox_synced_impl(&store.root, &[String::from("local-b")], None)
        .expect("entry should mark synced");

    let pending = list_local_outbox_impl(&store.root, Some(LocalSyncStatus::Pending), Some(1))
        .expect("outbox should list");

    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].local_id, "local-a");
}

#[test]
fn list_outbox_returns_cursor_pages_with_total_count() {
    let store = TestStore::new("outbox-page");
    for index in 0..3 {
        save_local_runtime_snapshot_impl(
            &store.root,
            snapshot_input(
                &format!("local-{index}"),
                &format!("idem-{index}"),
                json!({ "value": index }),
            ),
        )
        .expect("snapshot should save");
    }

    let first_page =
        list_local_outbox_page_impl(&store.root, None, Some(0), Some(2)).expect("page should list");
    let second_page =
        list_local_outbox_page_impl(&store.root, None, first_page.next_cursor, Some(2))
            .expect("second page should list");

    assert_eq!(first_page.total_count, 3);
    assert_eq!(first_page.entries.len(), 2);
    assert_eq!(first_page.next_cursor, Some(2));
    assert_eq!(second_page.total_count, 3);
    assert_eq!(second_page.entries.len(), 1);
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn list_outbox_cursor_beyond_total_returns_empty_page() {
    let store = TestStore::new("outbox-empty-page");
    save_local_runtime_snapshot_impl(
        &store.root,
        snapshot_input("local-a", "idem-a", json!({ "value": "a" })),
    )
    .expect("snapshot should save");

    let page = list_local_outbox_page_impl(&store.root, None, Some(25), Some(2))
        .expect("page should list");

    assert_eq!(page.total_count, 1);
    assert!(page.entries.is_empty());
    assert_eq!(page.next_cursor, None);
}

#[test]
fn list_reaction_artifacts_returns_cursor_pages_with_total_count() {
    let store = TestStore::new("artifact-page");
    for index in 0..3 {
        save_local_reaction_intelligence_artifact_impl(
            &store.root,
            artifact_input(
                &format!("local-artifact-{index}"),
                &format!("idem-artifact-{index}"),
                "graph-index-page",
                0.7 + f64::from(index) / 10.0,
            ),
        )
        .expect("artifact should save");
    }

    let first_page = list_local_reaction_intelligence_artifacts_page_impl(
        &store.root,
        Some("graph-index-page".into()),
        Some(0),
        Some(2),
    )
    .expect("artifact page should list");
    let second_page = list_local_reaction_intelligence_artifacts_page_impl(
        &store.root,
        Some("graph-index-page".into()),
        first_page.next_cursor,
        Some(2),
    )
    .expect("second artifact page should list");

    assert_eq!(first_page.total_count, 3);
    assert_eq!(first_page.entries.len(), 2);
    assert_eq!(first_page.next_cursor, Some(2));
    assert_eq!(second_page.total_count, 3);
    assert_eq!(second_page.entries.len(), 1);
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn clear_failures_removes_failed_only() {
    let store = TestStore::new("clear");
    write_outbox(
        &store.root,
        json!({
            "entries": [
                outbox_entry("pending-one", "idem-pending", "pending"),
                outbox_entry("failed-one", "idem-failed", "failed"),
                outbox_entry("synced-one", "idem-synced", "synced")
            ]
        }),
    );

    let result =
        clear_local_outbox_failures_impl(&store.root).expect("failed entries should clear");
    let entries = list_local_outbox_impl(&store.root, None, None).expect("outbox should list");

    assert_eq!(result.updated, 1);
    assert_eq!(entries.len(), 2);
    assert!(entries
        .iter()
        .all(|entry| entry.sync_status != LocalSyncStatus::Failed));
    assert_eq!(
        read_local_store_status_impl(&store.root)
            .unwrap()
            .outbox_failed_count,
        0
    );
}

#[test]
fn invalid_sync_status_is_rejected_when_reading_outbox() {
    let store = TestStore::new("invalid-status");
    write_outbox(
        &store.root,
        json!({
            "entries": [
                outbox_entry("bad-one", "idem-bad", "retrying")
            ]
        }),
    );

    let error =
        list_local_outbox_impl(&store.root, None, None).expect_err("unknown status should fail");

    assert_eq!(error.code, "local_store_parse_failed");
}

fn outbox_entry(local_id: &str, idempotency_key: &str, sync_status: &str) -> serde_json::Value {
    json!({
        "localId": local_id,
        "idempotencyKey": idempotency_key,
        "createdAt": "1",
        "syncStatus": sync_status,
        "payload": { "id": local_id },
        "metadata": { "localStoreKind": "runtime_graph_rag_snapshot" },
        "failureCount": if sync_status == "failed" { 1 } else { 0 },
        "lastError": if sync_status == "failed" { Some("redacted") } else { None },
        "updatedAt": "1",
        "syncedAt": if sync_status == "synced" { Some("2") } else { None }
    })
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

fn artifact_input(
    local_id: &str,
    idempotency_key: &str,
    graph_index_id: &str,
    score: f64,
) -> LocalReactionIntelligenceArtifactInput {
    LocalReactionIntelligenceArtifactInput {
        local_id: local_id.into(),
        idempotency_key: idempotency_key.into(),
        artifact: json!({
            "schema_version": "chemd-reaction-intelligence-artifact/v0.1",
            "artifact_id": local_id,
            "job_id": "job-local",
            "graph_index_id": graph_index_id,
            "generated_at": "2026-05-12T09:00:00.000Z",
            "providers": [],
            "reaction_features": [],
            "similarity_edges": [{
                "edge_id": "edge-local",
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": score,
                "confidence": "high",
                "basis": ["rdkit_fingerprint_tanimoto"],
                "provider_ids": ["rdkit-local"],
                "source_hashes": ["hash-a", "hash-b"],
                "warnings": []
            }],
            "warnings": []
        }),
        metadata: json!({ "localStoreKind": "reaction_intelligence_artifact" }),
        created_at: "2026-05-12T09:00:00.000Z".into(),
    }
}

fn write_outbox(root: &PathBuf, file: serde_json::Value) {
    fs::write(
        root.join("outbox.json"),
        serde_json::to_string_pretty(&file).expect("test outbox should serialize"),
    )
    .expect("test outbox should write");
}
