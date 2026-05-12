use crate::{
    managed_postgres::{mapped_migration_state, ManagedPostgresManager},
    managed_postgres_config::{
        create_managed_paths, discover_managed_postgres_binaries, generated_managed_config,
        managed_env_source, write_managed_config,
    },
    managed_postgres_migrations::managed_migration_sql,
    managed_postgres_process::{pid_file_owns_data_dir, write_pid_file, ManagedPostgresPidFile},
    postgres::{schema_ready_from_rows, status_without_config, CORE_SCHEMA_TABLES},
    postgres_config::{
        load_postgres_config_from_managed_root, normalize_postgres_database_url, parse_env_file,
        redact_postgres_url, select_postgres_config, EnvSource,
    },
    postgres_runtime_persist::validate_runtime_graph_rag_input,
    postgres_runtime_types::{
        PersistRuntimeGraphRagInput, RuntimeGraphEdgeRecord, RuntimeGraphNodeRecord,
        RuntimeGraphSnapshotRecord,
    },
};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

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
fn jdbc_postgres_urls_are_normalized_before_runtime_use() {
    assert_eq!(
        normalize_postgres_database_url(" jdbc:postgresql://103.24.219.156:5632/postgres "),
        "postgresql://103.24.219.156:5632/postgres"
    );
    assert_eq!(
        normalize_postgres_database_url(
            "jdbc:postgresql://103.24.219.156:5632/postgres?user=chemd&password=secret&sslmode=require"
        ),
        "postgresql://chemd:secret@103.24.219.156:5632/postgres?sslmode=require"
    );

    let config = select_postgres_config(vec![source(
        "process env",
        &[(
            "CHEMD_POSTGRES_DATABASE_URL",
            "jdbc:postgresql://103.24.219.156:5632/postgres?user=chemd&password=secret",
        )],
    )])
    .expect("jdbc config should be selected");

    assert_eq!(
        config.database_url,
        "postgresql://chemd:secret@103.24.219.156:5632/postgres"
    );
    assert_eq!(config.host.as_deref(), Some("103.24.219.156"));
    assert_eq!(config.database.as_deref(), Some("postgres"));
    assert_eq!(config.user.as_deref(), Some("chemd"));
    assert_eq!(config.password.as_deref(), Some("secret"));
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
fn managed_binary_discovery_accepts_windows_exe_suffixes() {
    let tree = TestTree::new("managed-bin");
    tree.touch_bin("initdb");
    tree.touch_bin("postgres");
    tree.touch_bin("psql");

    let availability = discover_managed_postgres_binaries(Some(&tree.bin_dir()), &[]);

    assert!(availability.available);
    let binaries = availability.binaries.expect("binaries should be found");
    assert!(binaries
        .initdb
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("initdb"));
    assert!(binaries.postgres.is_some());
    assert!(binaries
        .psql
        .file_name()
        .unwrap()
        .to_string_lossy()
        .starts_with("psql"));
}

#[test]
fn managed_status_reports_unavailable_when_binaries_are_missing() {
    let tree = TestTree::new("managed-missing-bin");
    let manager = ManagedPostgresManager::default();

    let status = manager
        .status(&tree.root, &[])
        .expect("status should not fail when binaries are absent");
    let value = serde_json::to_value(status).expect("status should serialize");

    assert_eq!(
        value.get("available").and_then(|value| value.as_bool()),
        Some(false)
    );
    assert!(value
        .get("reason")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .contains("CHEMD_MANAGED_POSTGRES_BIN_DIR"));
}

#[test]
fn managed_config_status_redacts_password_and_database_url() {
    let tree = TestTree::new("managed-redaction");
    tree.touch_bin("initdb");
    tree.touch_bin("postgres");
    tree.touch_bin("psql");
    let paths = create_managed_paths(&tree.root).expect("paths should be created");
    let mut config = generated_managed_config(&tree.root);
    config.password = "secret-managed-password".into();
    write_managed_config(&paths, &config).expect("config should be written");
    let manager = ManagedPostgresManager::default();

    let status = manager
        .status(&tree.root, &[tree.bin_dir()])
        .expect("status should be readable");
    let serialized = serde_json::to_string(&status).expect("status should serialize");

    assert!(!serialized.contains("secret-managed-password"));
    assert!(!serialized.contains(&config.database_url()));
    assert!(serialized.contains("\"user\":\"chemd_desktop\""));
}

#[test]
fn external_env_source_still_wins_over_managed_fallback() {
    let tree = TestTree::new("managed-priority");
    let paths = create_managed_paths(&tree.root).expect("paths should be created");
    let managed = generated_managed_config(&tree.root);
    write_managed_config(&paths, &managed).expect("config should be written");
    let managed_source = managed_env_source(&paths).expect("managed source should exist");

    let config = select_postgres_config(vec![
        source(
            "process env",
            &[(
                "CHEMD_POSTGRES_DATABASE_URL",
                "postgres://external:secret@db/chemd",
            )],
        ),
        managed_source,
    ])
    .expect("config should be selected");

    assert_eq!(config.source, "process env:CHEMD_POSTGRES_DATABASE_URL");
    assert_eq!(config.user.as_deref(), Some("external"));
}

#[test]
fn managed_config_can_be_loaded_as_fallback() {
    let tree = TestTree::new("managed-fallback");
    let paths = create_managed_paths(&tree.root).expect("paths should be created");
    let managed = generated_managed_config(&tree.root);
    write_managed_config(&paths, &managed).expect("config should be written");

    let config = load_postgres_config_from_managed_root(None, Some(&tree.root))
        .expect("managed fallback should be selected");

    assert!(config.source.starts_with("managed postgres:"));
    assert_eq!(config.host.as_deref(), Some("127.0.0.1"));
    assert_eq!(config.database.as_deref(), Some("chemd_desktop"));
    assert_eq!(config.user.as_deref(), Some("chemd_desktop"));
}

#[test]
fn pid_ownership_guard_rejects_unrelated_data_dir() {
    let tree = TestTree::new("managed-pid-guard");
    let paths = create_managed_paths(&tree.root).expect("paths should be created");
    fs::create_dir_all(&paths.data_dir).expect("data dir should be created");
    let owned = write_pid_file(&paths, 42).expect("pid file should be written");
    let unrelated = tree.root.join("other-data");
    fs::create_dir_all(&unrelated).expect("other dir should be created");

    assert!(pid_file_owns_data_dir(&owned, &paths.data_dir));
    assert!(!pid_file_owns_data_dir(&owned, &unrelated));

    let wrong_owner = ManagedPostgresPidFile {
        owner: "other-app".into(),
        ..owned
    };
    assert!(!pid_file_owns_data_dir(&wrong_owner, &paths.data_dir));
}

#[test]
fn migration_state_mapping_distinguishes_pending_applied_and_failed() {
    let all_tables = CORE_SCHEMA_TABLES
        .iter()
        .map(|table| table.to_string())
        .collect::<Vec<_>>();

    assert_eq!(mapped_migration_state(true, &all_tables), "applied");
    assert_eq!(mapped_migration_state(false, &[]), "pending");
    assert_eq!(mapped_migration_state(false, &all_tables[..2]), "failed");
}

#[test]
fn managed_migration_uses_shared_storage_columns_without_desktop_tables() {
    let sql = managed_migration_sql();

    assert!(sql.contains("experiment_date date NOT NULL"));
    assert!(sql.contains("raw_source text NOT NULL"));
    assert!(sql.contains("chunk_type text NOT NULL"));
    assert!(sql.contains("source_entity_ids text[] NOT NULL DEFAULT '{}'"));
    assert!(sql.contains("embedding_dim integer NOT NULL"));
    assert!(sql.contains("CREATE TABLE IF NOT EXISTS chemd_reaction_graph_snapshots"));
    assert!(sql.contains("CREATE TABLE IF NOT EXISTS chemd_agent_runs"));
    assert!(!sql.contains("CREATE TABLE IF NOT EXISTS desktop_"));
    assert!(!sql.contains("CREATE TABLE IF NOT EXISTS chemd_desktop_"));
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

struct TestTree {
    root: PathBuf,
}

impl TestTree {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("chemd-postgres-{name}-{suffix}"));
        fs::create_dir_all(&root).expect("test tree should be created");
        Self { root }
    }

    fn bin_dir(&self) -> PathBuf {
        self.root.join("bin")
    }

    fn touch_bin(&self, name: &str) {
        fs::create_dir_all(self.bin_dir()).expect("bin dir should be created");
        fs::write(self.bin_dir().join(exe_name(name)), "").expect("bin marker should be written");
    }
}

impl Drop for TestTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[cfg(windows)]
fn exe_name(name: &str) -> String {
    format!("{name}.exe")
}

#[cfg(not(windows))]
fn exe_name(name: &str) -> String {
    name.into()
}
