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
    assert_eq!(parsed["summary"]["commandCount"], 22);
    assert_eq!(parsed["summary"]["boundarySkipCount"], 5);
    assert_eq!(parsed["runtimeBoundaries"][0]["status"], "SKIP");
    assert!(json.contains("export_diagnostics_bundle"));

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

    assert_eq!(statuses, vec!["SKIP", "SKIP", "SKIP", "SKIP", "SKIP"]);

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
