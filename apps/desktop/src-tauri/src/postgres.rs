#![cfg_attr(test, allow(dead_code))]

use crate::postgres_config::{load_postgres_config, redact_config_detail, PostgresRuntimeConfig};
use native_tls::TlsConnector;
use postgres::{Client, Config as PgConfig};
use postgres_native_tls::MakeTlsConnector;
use serde::Serialize;
use std::{str::FromStr, time::Duration};

pub(crate) const CORE_SCHEMA_TABLES: [&str; 11] = [
    "chemd_experiments",
    "chemd_experiment_revisions",
    "chemd_rag_chunks",
    "chemd_rag_chunk_embeddings",
    "chemd_reaction_graph_snapshots",
    "chemd_reaction_graph_nodes",
    "chemd_reaction_graph_edges",
    "chemd_rag_chunk_citations",
    "chemd_agent_runs",
    "chemd_agent_tool_calls",
    "chemd_patch_proposals",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostgresStatus {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) configured: bool,
    pub(crate) source: Option<String>,
    pub(crate) host: Option<String>,
    pub(crate) database: Option<String>,
    pub(crate) user: Option<String>,
    pub(crate) ssl: String,
    pub(crate) vector_installed: Option<bool>,
    pub(crate) schema_ready: Option<bool>,
    pub(crate) timeout_ms: u64,
    pub(crate) pool: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub async fn read_postgres_status() -> PostgresStatus {
    match tauri::async_runtime::spawn_blocking(read_postgres_status_impl).await {
        Ok(status) => status,
        Err(error) => PostgresStatus {
            state: "degraded".into(),
            label: "Postgres status failed".into(),
            detail: format!("Postgres status task failed: {error}"),
            configured: false,
            source: None,
            host: None,
            database: None,
            user: None,
            ssl: "unknown".into(),
            vector_installed: None,
            schema_ready: None,
            timeout_ms: 0,
            pool: None,
        },
    }
}

pub(crate) fn read_postgres_status_impl() -> PostgresStatus {
    let Some(config) = load_postgres_config() else {
        return status_without_config();
    };

    match probe_database(&config) {
        Ok(probe) => status_from_probe(&config, probe),
        Err(detail) => configured_status(
            &config,
            "degraded",
            "Postgres degraded",
            &format!("Connection or read-only checks failed: {detail}"),
            None,
            None,
        ),
    }
}

pub(crate) fn status_without_config() -> PostgresStatus {
    PostgresStatus {
        state: "placeholder".into(),
        label: "Postgres not configured".into(),
        detail: "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL to enable database checks".into(),
        configured: false,
        source: None,
        host: None,
        database: None,
        user: None,
        ssl: "not configured".into(),
        vector_installed: None,
        schema_ready: None,
        timeout_ms: 0,
        pool: None,
    }
}

pub(crate) fn schema_ready_from_rows(found_tables: &[String]) -> bool {
    CORE_SCHEMA_TABLES
        .iter()
        .all(|table| found_tables.iter().any(|found| found == table))
}

struct ProbeResult {
    vector_installed: bool,
    schema_ready: bool,
}

fn probe_database(config: &PostgresRuntimeConfig) -> Result<ProbeResult, String> {
    let mut client = connect(config)?;
    let _: i32 = client
        .query_one("SELECT 1", &[])
        .map_err(|error| redact_config_detail(&error.to_string(), config))?
        .get(0);

    let vector_installed = client
        .query_one(
            "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')",
            &[],
        )
        .map_err(|error| redact_config_detail(&error.to_string(), config))?
        .get(0);

    let found_tables = read_existing_core_tables(&mut client, config)?;
    Ok(ProbeResult {
        vector_installed,
        schema_ready: schema_ready_from_rows(&found_tables),
    })
}

fn connect(config: &PostgresRuntimeConfig) -> Result<Client, String> {
    let mut pg_config = PgConfig::from_str(&config.database_url)
        .map_err(|error| redact_config_detail(&error.to_string(), config))?;
    pg_config.connect_timeout(Duration::from_millis(config.timeout_ms.max(1)));
    let tls = TlsConnector::builder()
        .build()
        .map_err(|error| error.to_string())?;
    pg_config
        .connect(MakeTlsConnector::new(tls))
        .map_err(|error| redact_config_detail(&error.to_string(), config))
}

fn read_existing_core_tables(
    client: &mut Client,
    config: &PostgresRuntimeConfig,
) -> Result<Vec<String>, String> {
    let table_names = CORE_SCHEMA_TABLES
        .iter()
        .map(|table| format!("'{table}'"))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT table_name FROM information_schema.tables \
         WHERE table_schema = 'public' AND table_name IN ({table_names})"
    );
    client
        .query(&sql, &[])
        .map(|rows| rows.iter().map(|row| row.get(0)).collect())
        .map_err(|error| redact_config_detail(&error.to_string(), config))
}

fn status_from_probe(config: &PostgresRuntimeConfig, probe: ProbeResult) -> PostgresStatus {
    if !probe.vector_installed {
        return configured_status(
            config,
            "degraded",
            "Postgres degraded",
            "Connected, but pgvector extension is missing",
            Some(false),
            Some(probe.schema_ready),
        );
    }
    if !probe.schema_ready {
        return configured_status(
            config,
            "degraded",
            "Postgres degraded",
            "Connected, but required Chemd Graph/RAG tables are missing",
            Some(true),
            Some(false),
        );
    }
    configured_status(
        config,
        "ready",
        "Postgres ready",
        "Connected and verified SELECT 1, pgvector, and Chemd Graph/RAG schema",
        Some(true),
        Some(true),
    )
}

fn configured_status(
    config: &PostgresRuntimeConfig,
    state: &str,
    label: &str,
    detail: &str,
    vector_installed: Option<bool>,
    schema_ready: Option<bool>,
) -> PostgresStatus {
    PostgresStatus {
        state: state.into(),
        label: label.into(),
        detail: detail.into(),
        configured: true,
        source: Some(config.source.clone()),
        host: config.host.clone(),
        database: config.database.clone(),
        user: config.user.clone(),
        ssl: config.ssl.clone(),
        vector_installed,
        schema_ready,
        timeout_ms: config.timeout_ms,
        pool: config.pool.clone(),
    }
}
