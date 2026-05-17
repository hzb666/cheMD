use crate::diagnostics_bundle::export_diagnostics_bundle_to_dir;
use serde_json::Value;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn export_diagnostics_bundle_writes_parseable_json() {
    let dir = test_dir("writes");
    let result = export_diagnostics_bundle_to_dir(dir.clone()).expect("bundle export succeeds");

    let json = fs::read_to_string(&result_path(&result.output_path)).expect("bundle file exists");
    let parsed: Value = serde_json::from_str(&json).expect("bundle is valid JSON");

    assert_eq!(parsed["schemaVersion"], 1);
    let known_commands = parsed["knownTauriCommands"]
        .as_array()
        .expect("known commands are an array");
    assert_eq!(parsed["summary"]["commandCount"], known_commands.len());
    assert_eq!(parsed["summary"]["boundarySkipCount"], 8);
    assert_eq!(parsed["summary"]["supportCommandCount"], 7);
    assert_eq!(parsed["runtimeBoundaries"][0]["status"], "SKIP");
    assert!(json.contains("export_diagnostics_bundle"));
    assert!(!json.contains("patch_workspace_file"));
    assert!(json.contains("run_reaction_intelligence_worker"));
    assert!(json.contains("save_local_reaction_intelligence_artifact"));
    assert!(json.contains("query_workspace_documents"));
    assert!(json.contains("list_local_reaction_intelligence_artifacts"));
    assert!(json.contains("sync_local_outbox_to_postgres"));
    assert!(json.contains("list_postgres_profiles"));
    assert!(json.contains("read_workspace_postgres_status"));
    assert!(json.contains("bind_workspace_postgres_profile"));
    assert!(json.contains("read_embedding_provider_status"));
    assert!(json.contains("create_embedding_vector"));
    assert!(json.contains("create_embedding_vectors"));
    assert!(json.contains("query_postgres_rag"));
    assert!(json.contains("backfill_postgres_rag_embeddings"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn export_diagnostics_bundle_does_not_include_sensitive_values() {
    let dir = test_dir("redaction");
    let secret = "postgres://user:super-secret-value-123@example.test/db";

    let result = export_diagnostics_bundle_to_dir(dir.clone()).expect("bundle export succeeds");
    let json = fs::read_to_string(&result_path(&result.output_path)).expect("bundle file exists");

    assert!(!json.contains(secret));
    assert!(!json.contains("super-secret-value-123"));
    assert!(!json.contains("example.test/db"));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn export_diagnostics_bundle_marks_non_running_boundaries_as_skip() {
    let dir = test_dir("skip");
    let result = export_diagnostics_bundle_to_dir(dir.clone()).expect("bundle export succeeds");
    let json = fs::read_to_string(&result_path(&result.output_path)).expect("bundle file exists");
    let parsed: Value = serde_json::from_str(&json).expect("bundle is valid JSON");

    let statuses = parsed["runtimeBoundaries"]
        .as_array()
        .expect("runtime boundaries are an array")
        .iter()
        .map(|item| item["status"].as_str().unwrap_or_default())
        .collect::<Vec<_>>();

    assert_eq!(
        statuses,
        vec!["SKIP", "SKIP", "SKIP", "SKIP", "SKIP", "SKIP", "SKIP", "SKIP"]
    );

    let boundary_names = parsed["runtimeBoundaries"]
        .as_array()
        .expect("runtime boundaries are an array")
        .iter()
        .map(|item| item["name"].as_str().unwrap_or_default())
        .collect::<Vec<_>>();

    assert!(boundary_names.contains(&"provider"));
    assert!(boundary_names.contains(&"model"));
    assert!(boundary_names.contains(&"artifact"));
    assert!(boundary_names.contains(&"sync"));

    let _ = fs::remove_dir_all(dir);
}

fn test_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "chemd-diagnostics-bundle-test-{name}-{}-{}",
        std::process::id(),
        unix_timestamp_ms()
    ))
}

fn result_path(path: &str) -> PathBuf {
    PathBuf::from(path)
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
