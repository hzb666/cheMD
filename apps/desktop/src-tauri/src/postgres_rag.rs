#![cfg_attr(test, allow(dead_code))]

use crate::{
    postgres::connect,
    postgres_config::{
        load_postgres_config, load_postgres_config_for_workspace, redact_config_detail,
        PostgresRuntimeConfig,
    },
    postgres_runtime_types::PostgresTargetSummary,
};
use postgres::{types::ToSql, Client, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[cfg(not(test))]
use crate::workspace::CommandError;

const DEFAULT_LIMIT: i64 = 8;
const MAX_LIMIT: i64 = 20;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagQueryInput {
    pub(crate) query: String,
    pub(crate) embedding: Vec<f64>,
    pub(crate) embedding_model: String,
    pub(crate) limit: Option<i64>,
    pub(crate) workspace_id: Option<String>,
    pub(crate) document_id: Option<String>,
    pub(crate) revision_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagQueryResult {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) results: Vec<PostgresRagQueryResultItem>,
    pub(crate) blocked_count: usize,
    pub(crate) target: Option<PostgresTargetSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagQueryResultItem {
    pub(crate) chunk_id: String,
    pub(crate) revision_id: String,
    pub(crate) experiment_id: String,
    pub(crate) chunk_type: String,
    pub(crate) source_entity_ids: Vec<String>,
    pub(crate) text: String,
    pub(crate) metadata: Value,
    pub(crate) distance: f64,
    pub(crate) citation: PostgresRagQueryCitation,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagQueryCitation {
    pub(crate) locator: String,
    pub(crate) source_range: Value,
    pub(crate) citation: Value,
    pub(crate) quality: Value,
    pub(crate) source_uri: Option<String>,
    pub(crate) entity_id: Option<String>,
    pub(crate) block_id: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedPostgresRagQuery {
    embedding_model: String,
    query_vector: String,
    limit: i64,
    workspace_id: Option<String>,
    document_id: Option<String>,
    revision_id: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct PostgresRagQuerySql {
    pub(crate) sql: String,
    embedding_model: String,
    query_vector: String,
    filters: Vec<String>,
    limit: i64,
}

#[derive(Debug, Clone)]
pub(crate) struct PostgresRagCandidateRow {
    pub(crate) chunk_id: String,
    pub(crate) revision_id: String,
    pub(crate) experiment_id: String,
    pub(crate) chunk_type: String,
    pub(crate) source_entity_ids: Vec<String>,
    pub(crate) text: String,
    pub(crate) metadata_json: String,
    pub(crate) distance: f64,
    pub(crate) source_uri: Option<String>,
    pub(crate) citation_source_range_json: Option<String>,
    pub(crate) citation_json: Option<String>,
    pub(crate) citation_quality_json: Option<String>,
    pub(crate) citation_entity_id: Option<String>,
    pub(crate) citation_block_id: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub async fn query_postgres_rag(
    input: PostgresRagQueryInput,
) -> Result<PostgresRagQueryResult, CommandError> {
    match tauri::async_runtime::spawn_blocking(move || query_postgres_rag_impl(input)).await {
        Ok(result) => Ok(result),
        Err(error) => Err(CommandError::new(
            "postgres_rag_query_task_failed",
            "Postgres RAG query task failed",
            Some(error.to_string()),
        )),
    }
}

pub(crate) fn query_postgres_rag_impl(input: PostgresRagQueryInput) -> PostgresRagQueryResult {
    let query = match validate_postgres_rag_query(input) {
        Ok(query) => query,
        Err(detail) => return degraded_result("Postgres RAG query rejected", detail, None, 0),
    };
    let config = query
        .workspace_id
        .as_deref()
        .map(|workspace_id| load_postgres_config_for_workspace(Some(workspace_id)))
        .unwrap_or_else(load_postgres_config);
    let Some(config) = config else {
        let detail = query.workspace_id.as_deref().map_or_else(
            || "No active PostgreSQL target is configured for Desktop RAG query".to_string(),
            |workspace_id| {
                format!(
                "No PostgreSQL profile is bound to workspace {workspace_id} for Desktop RAG query"
            )
            },
        );
        return PostgresRagQueryResult {
            state: "offline".into(),
            label: "Postgres RAG offline".into(),
            detail,
            results: Vec::new(),
            blocked_count: 0,
            target: None,
        };
    };

    let mut client = match connect(&config) {
        Ok(client) => client,
        Err(detail) => {
            return degraded_result(
                "Postgres RAG degraded",
                format!("Failed to connect to PostgreSQL: {detail}"),
                Some(&config),
                0,
            )
        }
    };
    match execute_postgres_rag_query(&mut client, &query, &config) {
        Ok(result) => result,
        Err(detail) => degraded_result("Postgres RAG degraded", detail, Some(&config), 0),
    }
}

pub(crate) fn validate_postgres_rag_query(
    input: PostgresRagQueryInput,
) -> Result<ValidatedPostgresRagQuery, String> {
    require_non_empty("query", &input.query)?;
    require_non_empty("embeddingModel", &input.embedding_model)?;
    require_optional_non_empty("workspaceId", input.workspace_id.as_deref())?;
    require_optional_non_empty("documentId", input.document_id.as_deref())?;
    require_optional_non_empty("revisionId", input.revision_id.as_deref())?;
    Ok(ValidatedPostgresRagQuery {
        embedding_model: input.embedding_model.trim().into(),
        query_vector: vector_literal(&input.embedding)?,
        limit: clamp_limit(input.limit),
        workspace_id: input.workspace_id.map(|value| value.trim().into()),
        document_id: input.document_id.map(|value| value.trim().into()),
        revision_id: input.revision_id.map(|value| value.trim().into()),
    })
}

pub(crate) fn build_postgres_rag_query_sql(
    query: &ValidatedPostgresRagQuery,
) -> PostgresRagQuerySql {
    let mut filters = Vec::new();
    let mut clauses = vec!["e.embedding_model = $1".to_string()];
    push_optional_filter(
        &mut filters,
        &mut clauses,
        query.workspace_id.as_deref(),
        "(c.metadata->>'workspaceId' = ${idx} OR cit.citation->>'workspaceId' = ${idx})",
    );
    push_optional_filter(
        &mut filters,
        &mut clauses,
        query.document_id.as_deref(),
        "(c.metadata->>'documentId' = ${idx} OR cit.citation->>'documentId' = ${idx})",
    );
    push_optional_filter(
        &mut filters,
        &mut clauses,
        query.revision_id.as_deref(),
        "c.revision_id = ${idx}",
    );
    let limit_index = filters.len() + 3;
    let sql = format!(
        "SELECT
           c.chunk_id,
           c.revision_id,
           c.experiment_id,
           c.chunk_type,
           c.source_entity_ids,
           c.text,
           c.metadata::text AS metadata_json,
           e.embedding <=> $2::vector AS distance,
           r.source_uri,
           cit.source_range::text AS citation_source_range_json,
           cit.citation::text AS citation_json,
           cit.quality::text AS citation_quality_json,
           cit.entity_id AS citation_entity_id,
           cit.block_id AS citation_block_id
         FROM chemd_rag_chunk_embeddings e
         JOIN chemd_rag_chunks c
           ON c.revision_id = e.revision_id
          AND c.chunk_id = e.chunk_id
         LEFT JOIN chemd_rag_chunk_citations cit
           ON cit.revision_id = c.revision_id
          AND cit.chunk_id = c.chunk_id
         LEFT JOIN chemd_experiment_revisions r
           ON r.revision_id = c.revision_id
         WHERE {clauses}
         ORDER BY e.embedding <=> $2::vector
         LIMIT ${limit_index}",
        clauses = clauses.join(" AND ")
    );
    PostgresRagQuerySql {
        sql,
        embedding_model: query.embedding_model.clone(),
        query_vector: query.query_vector.clone(),
        filters,
        limit: query.limit,
    }
}

pub(crate) fn map_postgres_rag_rows(
    rows: Vec<PostgresRagCandidateRow>,
) -> (Vec<PostgresRagQueryResultItem>, usize) {
    let mut results = Vec::new();
    let mut blocked_count = 0;
    for row in rows {
        match map_citation_backed_row(row) {
            Some(result) => results.push(result),
            None => blocked_count += 1,
        }
    }
    (results, blocked_count)
}

fn execute_postgres_rag_query(
    client: &mut Client,
    query: &ValidatedPostgresRagQuery,
    config: &PostgresRuntimeConfig,
) -> Result<PostgresRagQueryResult, String> {
    let query_sql = build_postgres_rag_query_sql(query);
    let params = query_sql.params();
    let rows = client
        .query(&query_sql.sql, &params)
        .map_err(|error| redact_config_detail(&error.to_string(), config))?
        .into_iter()
        .map(candidate_from_row)
        .collect::<Vec<_>>();
    let (results, blocked_count) = map_postgres_rag_rows(rows);
    Ok(PostgresRagQueryResult {
        state: "ready".into(),
        label: "Postgres RAG ready".into(),
        detail: format!(
            "Returned {} citation-backed RAG chunks from {}",
            results.len(),
            target_detail(config)
        ),
        results,
        blocked_count,
        target: Some(target_summary(config)),
    })
}

impl PostgresRagQuerySql {
    fn params(&self) -> Vec<&(dyn ToSql + Sync)> {
        let mut params: Vec<&(dyn ToSql + Sync)> = vec![&self.embedding_model, &self.query_vector];
        for filter in &self.filters {
            params.push(filter);
        }
        params.push(&self.limit);
        params
    }
}

fn push_optional_filter(
    filters: &mut Vec<String>,
    clauses: &mut Vec<String>,
    value: Option<&str>,
    template: &str,
) {
    if let Some(value) = value {
        filters.push(value.to_string());
        let index = filters.len() + 2;
        clauses.push(template.replace("${idx}", &format!("${index}")));
    }
}

fn candidate_from_row(row: Row) -> PostgresRagCandidateRow {
    PostgresRagCandidateRow {
        chunk_id: row.get("chunk_id"),
        revision_id: row.get("revision_id"),
        experiment_id: row.get("experiment_id"),
        chunk_type: row.get("chunk_type"),
        source_entity_ids: row.get("source_entity_ids"),
        text: row.get("text"),
        metadata_json: row.get("metadata_json"),
        distance: row.get("distance"),
        source_uri: row.get("source_uri"),
        citation_source_range_json: row.get("citation_source_range_json"),
        citation_json: row.get("citation_json"),
        citation_quality_json: row.get("citation_quality_json"),
        citation_entity_id: row.get("citation_entity_id"),
        citation_block_id: row.get("citation_block_id"),
    }
}

fn map_citation_backed_row(row: PostgresRagCandidateRow) -> Option<PostgresRagQueryResultItem> {
    let citation = object_json(row.citation_json.as_deref()?)?;
    let source_range = object_json(row.citation_source_range_json.as_deref().unwrap_or("{}"))?;
    let citation_id = citation_id(&citation)?;
    range_locator(&source_range)?;
    let quality = object_json(row.citation_quality_json.as_deref().unwrap_or("{}"))?;
    let source_uri = json_text(&citation, "documentUri")
        .or_else(|| json_text(&citation, "sourceUri"))
        .or(row.source_uri.clone());
    let locator = citation_locator(&row, &citation_id, &source_range, source_uri.as_deref());
    Some(PostgresRagQueryResultItem {
        chunk_id: row.chunk_id,
        revision_id: row.revision_id,
        experiment_id: row.experiment_id,
        chunk_type: row.chunk_type,
        source_entity_ids: row.source_entity_ids,
        text: row.text,
        metadata: object_json(&row.metadata_json).unwrap_or_else(empty_object),
        distance: row.distance,
        citation: PostgresRagQueryCitation {
            locator,
            source_range,
            citation,
            quality,
            source_uri,
            entity_id: row.citation_entity_id,
            block_id: row.citation_block_id,
        },
    })
}

fn citation_locator(
    row: &PostgresRagCandidateRow,
    citation_id: &str,
    source_range: &Value,
    source_uri: Option<&str>,
) -> String {
    let suffix = range_locator(source_range)
        .map(|range| format!(":{range}"))
        .unwrap_or_default();
    source_uri
        .filter(|value| !value.trim().is_empty())
        .map(|uri| format!("{uri}#{citation_id}{suffix}"))
        .unwrap_or_else(|| format!("{}:{}{}", row.revision_id, row.chunk_id, suffix))
}

fn citation_id(citation: &Value) -> Option<String> {
    json_text(citation, "citationId").or_else(|| json_text(citation, "id"))
}

fn range_locator(source_range: &Value) -> Option<String> {
    let start_line = json_i64(source_range, "startLine");
    let end_line = json_i64(source_range, "endLine");
    if let Some(start_line) = start_line {
        return Some(match end_line {
            Some(end_line) if end_line != start_line => format!("L{start_line}-L{end_line}"),
            _ => format!("L{start_line}"),
        });
    }
    json_i64(source_range, "start").map(|start| match json_i64(source_range, "end") {
        Some(end) if end != start => format!("{start}-{end}"),
        _ => start.to_string(),
    })
}

fn object_json(raw: &str) -> Option<Value> {
    match serde_json::from_str::<Value>(raw).ok()? {
        Value::Object(map) => Some(Value::Object(map)),
        _ => None,
    }
}

fn empty_object() -> Value {
    Value::Object(Map::new())
}

fn json_text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
}

fn json_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(Value::as_i64)
}

pub(crate) fn clamp_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)
}

pub(crate) fn vector_literal(values: &[f64]) -> Result<String, String> {
    if values.is_empty() {
        return Err("embedding must not be empty".into());
    }
    for value in values {
        if !value.is_finite() {
            return Err("embedding values must be finite numbers".into());
        }
    }
    Ok(format!(
        "[{}]",
        values
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .join(",")
    ))
}

pub(crate) fn redact_postgres_rag_detail(detail: &str, config: &PostgresRuntimeConfig) -> String {
    redact_config_detail(detail, config)
}

fn require_non_empty(field: &str, value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field} must not be empty"));
    }
    Ok(())
}

fn require_optional_non_empty(field: &str, value: Option<&str>) -> Result<(), String> {
    if matches!(value, Some(text) if text.trim().is_empty()) {
        return Err(format!("{field} must not be empty when provided"));
    }
    Ok(())
}

fn degraded_result(
    label: &str,
    detail: String,
    config: Option<&PostgresRuntimeConfig>,
    blocked_count: usize,
) -> PostgresRagQueryResult {
    PostgresRagQueryResult {
        state: "degraded".into(),
        label: label.into(),
        detail: config
            .map(|config| redact_postgres_rag_detail(&detail, config))
            .unwrap_or(detail),
        results: Vec::new(),
        blocked_count,
        target: config.map(target_summary),
    }
}

fn target_summary(config: &PostgresRuntimeConfig) -> PostgresTargetSummary {
    PostgresTargetSummary {
        source: config.source.clone(),
        host: config.host.clone(),
        database: config.database.clone(),
        user: config.user.clone(),
        ssl: config.ssl.clone(),
        timeout_ms: config.timeout_ms,
        pool: config.pool.clone(),
    }
}

fn target_detail(config: &PostgresRuntimeConfig) -> String {
    let host = config.host.as_deref().unwrap_or("unknown host");
    let database = config.database.as_deref().unwrap_or("unknown database");
    let user = config.user.as_deref().unwrap_or("unknown user");
    format!("{host}/{database} as {user}")
}
