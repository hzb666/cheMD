use crate::{
    postgres::{schema_ready_from_rows, status_without_config, CORE_SCHEMA_TABLES},
    postgres_config::{parse_env_file, redact_postgres_url, select_postgres_config, EnvSource},
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

fn source(label: &str, entries: &[(&str, &str)]) -> EnvSource {
    EnvSource {
        label: label.into(),
        vars: entries
            .iter()
            .map(|(key, value)| ((*key).into(), (*value).into()))
            .collect::<BTreeMap<String, String>>(),
    }
}
