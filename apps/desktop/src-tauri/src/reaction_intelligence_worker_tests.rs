use crate::reaction_intelligence_worker::{
    execute_worker_spec, find_service_dir_from, run_reaction_intelligence_worker_with, worker_spec,
    ReactionIntelligenceWorkerInput, ReactionIntelligenceWorkerSpec, WorkerProcessOutput,
    WorkerTempPaths,
};
use serde_json::{json, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn reaction_intelligence_worker_builds_cli_spec_with_overrides() {
    let dir = test_dir("spec");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);
    let python = service_dir.join(".venv").join("Scripts").join("python.exe");
    write_file(&python, "");

    let temp_paths = WorkerTempPaths::in_dir(&dir);
    let spec = worker_spec(
        &service_dir,
        &temp_paths,
        &ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: Some(vec![
                " rdkit_fingerprint ".into(),
                "".into(),
                "hybrid_graph".into(),
            ]),
            missing_dependency: Some("skip".into()),
            pretty: Some(true),
            timeout_ms: Some(0),
        },
    );

    assert_eq!(spec.program, python);
    assert_eq!(spec.cwd, service_dir);
    assert!(spec
        .args
        .contains(&"chem_cluster_service.intelligence.cli".into()));
    assert!(spec.args.contains(&"--providers".into()));
    assert!(spec.args.contains(&"rdkit_fingerprint".into()));
    assert!(spec.args.contains(&"hybrid_graph".into()));
    assert!(spec.args.contains(&"--missing-dependency".into()));
    assert!(spec.args.contains(&"skip".into()));
    assert!(spec.args.contains(&"--pretty".into()));
    assert_eq!(spec.timeout_ms, 1_000);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_clamps_timeout_spec_to_maximum() {
    let dir = test_dir("spec-timeout-max");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);
    let temp_paths = WorkerTempPaths::in_dir(&dir);

    let spec = worker_spec(
        &service_dir,
        &temp_paths,
        &ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: Some(u64::MAX),
        },
    );

    assert_eq!(spec.timeout_ms, 600_000);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_defaults_timeout_spec() {
    let dir = test_dir("spec-timeout-default");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);
    let temp_paths = WorkerTempPaths::in_dir(&dir);

    let spec = worker_spec(
        &service_dir,
        &temp_paths,
        &ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: None,
        },
    );

    assert_eq!(spec.timeout_ms, 120_000);

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_discovers_service_dir_from_ancestor() {
    let dir = test_dir("discover");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);
    let nested = dir.join("apps").join("desktop").join("src-tauri");
    fs::create_dir_all(&nested).expect("nested test dir");

    assert_eq!(find_service_dir_from(&nested), Some(service_dir));

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_missing_service_returns_skipped() {
    let result = run_reaction_intelligence_worker_with(
        ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: None,
        },
        || None,
        |_| unreachable!("worker should not execute without service dir"),
    )
    .expect("missing service is a structured result");

    let value = result_value(&result);
    assert_eq!(as_string(&value, "status"), "skipped");
    assert_eq!(
        as_string(&value, "message"),
        "Reaction intelligence worker service was not found"
    );
    assert!(value.get("artifactJson").expect("artifactJson").is_null());
}

#[test]
fn reaction_intelligence_worker_reads_artifact_and_cleans_temp_files() {
    let dir = test_dir("complete");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);
    let mut temp_paths = Vec::<PathBuf>::new();

    let result = run_reaction_intelligence_worker_with(
        ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: Some(vec!["rdkit_fingerprint".into()]),
            missing_dependency: Some("skip".into()),
            pretty: Some(true),
            timeout_ms: None,
        },
        || Some(service_dir.clone()),
        |spec| {
            temp_paths.push(spec.input_path.clone());
            temp_paths.push(spec.output_path.clone());
            write_file(
                &spec.output_path,
                &serde_json::to_string(&artifact_json()).unwrap(),
            );
            Ok(WorkerProcessOutput {
                exit_code: Some(0),
                stdout_tail: vec!["done".into()],
                stderr_tail: Vec::new(),
                timed_out: false,
            })
        },
    )
    .expect("worker result");

    let value = result_value(&result);
    assert_eq!(as_string(&value, "status"), "completed");
    assert_eq!(
        value["artifactJson"]["artifact_id"],
        "reaction-intelligence-artifact::unit"
    );
    assert_eq!(value["stdoutTail"][0], "done");
    for path in temp_paths {
        assert!(
            !path.exists(),
            "temp path should be cleaned: {}",
            path.display()
        );
    }

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_nonzero_exit_returns_failed() {
    let dir = test_dir("failed");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);

    let result = run_reaction_intelligence_worker_with(
        ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: None,
        },
        || Some(service_dir.clone()),
        |spec| {
            write_file(
                &spec.output_path,
                r#"{"status":"ERROR","code":"invalid_input","errors":["schema_version is invalid"]}"#,
            );
            Ok(WorkerProcessOutput {
                exit_code: Some(1),
                stdout_tail: Vec::new(),
                stderr_tail: vec!["validation failed".into()],
                timed_out: false,
            })
        },
    )
    .expect("worker result");

    let value = result_value(&result);
    assert_eq!(as_string(&value, "status"), "failed");
    assert_eq!(as_string(&value, "reason"), "invalid_input");
    assert_eq!(value["exitCode"], 1);
    assert_eq!(value["stderrTail"][0], "validation failed");

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_python_not_found_returns_skipped() {
    let dir = test_dir("python-missing");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);

    let result = run_reaction_intelligence_worker_with(
        ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: None,
        },
        || Some(service_dir.clone()),
        |_| Err(io::Error::new(io::ErrorKind::NotFound, "python not found")),
    )
    .expect("worker result");

    let value = result_value(&result);
    assert_eq!(as_string(&value, "status"), "skipped");
    assert_eq!(
        as_string(&value, "reason"),
        "reaction_intelligence_python_not_found"
    );
    assert_eq!(as_string(&value, "detail"), "python not found");
    assert!(value["artifactJson"].is_null());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_timeout_returns_failed_result_with_tails() {
    let dir = test_dir("timeout-result");
    let service_dir = service_dir(&dir);
    write_service_marker(&service_dir);

    let result = run_reaction_intelligence_worker_with(
        ReactionIntelligenceWorkerInput {
            job_json: job_json(),
            providers: None,
            missing_dependency: None,
            pretty: None,
            timeout_ms: Some(25),
        },
        || Some(service_dir.clone()),
        |_| {
            Ok(WorkerProcessOutput {
                exit_code: None,
                stdout_tail: vec!["worker started".into()],
                stderr_tail: vec!["model call still running".into()],
                timed_out: true,
            })
        },
    )
    .expect("worker result");

    let value = result_value(&result);
    assert_eq!(as_string(&value, "status"), "failed");
    assert_eq!(
        as_string(&value, "reason"),
        "reaction_intelligence_worker_timeout"
    );
    assert_eq!(as_string(&value, "detail"), "model call still running");
    assert_eq!(value["stdoutTail"][0], "worker started");
    assert_eq!(value["stderrTail"][0], "model call still running");
    assert!(value["artifactJson"].is_null());

    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reaction_intelligence_worker_executor_kills_timed_out_child() {
    let dir = test_dir("timeout-executor");
    fs::create_dir_all(&dir).expect("test dir");
    let (program, args) = timeout_test_command();
    let spec = ReactionIntelligenceWorkerSpec {
        program,
        args,
        cwd: dir.clone(),
        input_path: dir.join("worker-input.json"),
        output_path: dir.join("worker-output.json"),
        timeout_ms: 100,
    };

    let output = execute_worker_spec(&spec).expect("timeout executor output");

    assert!(output.timed_out);
    assert!(output.exit_code.is_none());

    let _ = fs::remove_dir_all(dir);
}

fn job_json() -> Value {
    json!({
        "schema_version": "chemd-reaction-intelligence-job/v0.1",
        "job_id": "reaction-intelligence-job::unit",
        "graph_index_id": "graph-index::unit",
        "source_compile_run_ids": ["compile-run::unit"],
        "reactions": [{
            "reaction_entity_id": "rxn-unit",
            "document_id": "doc-unit",
            "canonical_rxn_smiles": "CCO>>CC=O",
            "participant_signature": "unit",
            "source_hash": "sha256:unit"
        }],
        "requested_providers": ["rdkit_fingerprint"],
        "provider_policy": {
            "missing_dependency": "skip",
            "per_reaction_failure": "warn",
            "allow_network": false
        }
    })
}

fn artifact_json() -> Value {
    json!({
        "schema_version": "chemd-reaction-intelligence-artifact/v0.1",
        "artifact_id": "reaction-intelligence-artifact::unit",
        "job_id": "reaction-intelligence-job::unit",
        "graph_index_id": "graph-index::unit",
        "generated_at": "1700000000000",
        "providers": [{
            "provider_id": "provider::rdkit",
            "kind": "rdkit_fingerprint",
            "status": "SKIP",
            "warnings": ["dependency_not_installed"]
        }],
        "reaction_features": [],
        "similarity_edges": [],
        "warnings": []
    })
}

fn service_dir(root: &Path) -> PathBuf {
    root.join("services").join("chem-cluster-service")
}

fn write_service_marker(service_dir: &Path) {
    write_file(
        &service_dir
            .join("chem_cluster_service")
            .join("intelligence")
            .join("cli.py"),
        "",
    );
}

fn write_file(path: &Path, content: &str) {
    fs::create_dir_all(path.parent().expect("test file has parent")).expect("test parent");
    fs::write(path, content).expect("test file write");
}

fn result_value(
    result: &crate::reaction_intelligence_worker::ReactionIntelligenceWorkerResult,
) -> Value {
    serde_json::to_value(result).expect("result serializes")
}

fn as_string(value: &Value, field: &str) -> String {
    value[field].as_str().unwrap_or_default().to_string()
}

fn test_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "chemd-reaction-intelligence-worker-test-{name}-{}-{}",
        std::process::id(),
        unix_timestamp_ms()
    ))
}

#[cfg(windows)]
fn timeout_test_command() -> (PathBuf, Vec<String>) {
    (
        PathBuf::from("powershell.exe"),
        vec![
            "-NoProfile".into(),
            "-Command".into(),
            "Start-Sleep -Milliseconds 2000".into(),
        ],
    )
}

#[cfg(not(windows))]
fn timeout_test_command() -> (PathBuf, Vec<String>) {
    (PathBuf::from("sh"), vec!["-c".into(), "sleep 2".into()])
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
