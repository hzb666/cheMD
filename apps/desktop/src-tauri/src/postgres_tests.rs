use crate::{
    postgres::{schema_ready_from_rows, status_without_config, CORE_SCHEMA_TABLES},
    postgres_config::{parse_env_file, redact_postgres_url, select_postgres_config, EnvSource},
    postgres_runtime_persist::validate_runtime_graph_rag_input,
    postgres_runtime_types::{
        PersistRuntimeGraphRagInput, RuntimeGraphEdgeRecord, RuntimeGraphNodeRecord,
        RuntimeGraphSnapshotRecord,
    },
};
use std::collections::BTreeMap;

#[test]
fn parses_env_file_without_leaking_comments_or_quotes() {
    let vars = parse_env_file(
        r#"
        # ignored
        export CHEMD_POSTGRES_DATABASE_URL="postgres://app:secret@db.local:5432/chemd"
        CHEMD_POSTGRES_SSLMODE=require # comment
        EMPTY=
        "#,
    );

    assert_eq!(
        vars.get("CHEMD_POSTGRES_DATABASE_URL").map(String::as_str),
        Some("postgres://app:secret@db.local:5432/chemd")
    );
    assert_eq!(
        vars.get("CHEMD_POSTGRES_SSLMODE").map(String::as_str),
        Some("require")
    );
    assert_eq!(vars.get("EMPTY").map(String::as_str), Some(""));
}

#[test]
fn config_selection_prefers_process_env_and_redacts_url() {
    let config = select_postgres_config(vec![
        source(
            "process env",
            &[
                (
                    "DATABASE_URL",
                    "postgres://process_user:process_secret@db.process/chemd?sslmode=require",
                ),
                ("CHEMD_POSTGRES_CONNECT_TIMEOUT_MS", "3210"),
            ],
        ),
        source(
            ".env.local",
            &[(
                "CHEMD_POSTGRES_DATABASE_URL",
                "postgres://file_user:file_secret@db.file/chemd",
            )],
        ),
    ])
    .expect("config should be selected");

    assert_eq!(config.source, "process env:DATABASE_URL");
    assert_eq!(config.host.as_deref(), Some("db.process"));
    assert_eq!(config.database.as_deref(), Some("chemd"));
    assert_eq!(config.user.as_deref(), Some("process_user"));
    assert_eq!(config.password.as_deref(), Some("process_secret"));
    assert_eq!(config.ssl, "sslmode=require");
    assert_eq!(config.timeout_ms, 3210);
    assert_eq!(
        redact_postgres_url(&config.database_url),
        "postgres://process_user:%3Credacted%3E@db.process/chemd?sslmode=require"
    );
}

#[test]
fn missing_config_returns_placeholder_without_connection_attempt() {
    let status = status_without_config();

    assert_eq!(status.state, "placeholder");
    assert!(!status.configured);
    assert_eq!(status.vector_installed, None);
    assert_eq!(status.schema_ready, None);
}

#[test]
fn schema_row_mapping_requires_all_core_graph_rag_tables() {
    let all_tables = CORE_SCHEMA_TABLES
        .iter()
        .map(|table| table.to_string())
        .collect::<Vec<_>>();

    assert!(schema_ready_from_rows(&all_tables));

    let missing_one = all_tables
        .into_iter()
        .filter(|table| table != "chemd_rag_chunk_citations")
        .collect::<Vec<_>>();

    assert!(!schema_ready_from_rows(&missing_one));
}

#[test]
fn runtime_graph_rag_validation_rejects_empty_required_ids() {
    let mut records = valid_runtime_records();
    records.graph_snapshot.graph_snapshot_id = " ".into();

    let error = validate_runtime_graph_rag_input(&records)
        .expect_err("empty snapshot id should be rejected");

    assert_eq!(error.code, "postgres_runtime_invalid_input");
    assert!(error
        .detail
        .as_deref()
        .unwrap_or_default()
        .contains("graphSnapshot.graphSnapshotId"));
}

#[test]
fn runtime_graph_rag_validation_requires_edge_nodes_in_payload() {
    let mut records = valid_runtime_records();
    records.edges[0].to_node_id = "missing-node".into();

    let error = validate_runtime_graph_rag_input(&records)
        .expect_err("missing edge endpoint should be rejected");

    assert_eq!(error.code, "postgres_runtime_invalid_input");
    assert!(error
        .detail
        .as_deref()
        .unwrap_or_default()
        .contains("edge endpoints"));
}

fn source(label: &str, entries: &[(&str, &str)]) -> EnvSource {
    EnvSource {
        label: label.into(),
        vars: entries
            .iter()
            .map(|(key, value)| ((*key).into(), (*value).into()))
            .collect::<BTreeMap<String, String>>(),
    }
}

fn valid_runtime_records() -> PersistRuntimeGraphRagInput {
    PersistRuntimeGraphRagInput {
        graph_snapshot: RuntimeGraphSnapshotRecord {
            graph_snapshot_id: "graph-1".into(),
            experiment_id: "exp-1".into(),
            source_revision_ids: vec!["rev-1".into()],
            graph_kind: "reaction".into(),
            node_count: 2,
            edge_count: 1,
            created_at: "2026-05-12T00:00:00Z".into(),
        },
        nodes: vec![node("node-1", "entity-1"), node("node-2", "entity-2")],
        edges: vec![RuntimeGraphEdgeRecord {
            edge_id: "edge-1".into(),
            graph_snapshot_id: "graph-1".into(),
            experiment_id: "exp-1".into(),
            from_node_id: "node-1".into(),
            to_node_id: "node-2".into(),
            edge_type: "evidence_link".into(),
            confidence: "high".into(),
            evidence: serde_json::json!({ "reason": "test" }),
            created_at: "2026-05-12T00:00:00Z".into(),
        }],
        citation_candidates: Vec::new(),
        agent_runs: Vec::new(),
        agent_tool_calls: Vec::new(),
        patch_proposals: Vec::new(),
        metadata: None,
        created_at: None,
    }
}

fn node(node_id: &str, entity_id: &str) -> RuntimeGraphNodeRecord {
    RuntimeGraphNodeRecord {
        node_id: node_id.into(),
        graph_snapshot_id: "graph-1".into(),
        experiment_id: "exp-1".into(),
        revision_id: "rev-1".into(),
        entity_id: entity_id.into(),
        block_id: None,
        reaction_family: None,
        route_id: None,
        source_range: serde_json::json!({}),
        payload: serde_json::json!({}),
        created_at: "2026-05-12T00:00:00Z".into(),
    }
}
