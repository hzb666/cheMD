#![cfg_attr(test, allow(dead_code))]

use crate::postgres_runtime_types::PostgresTargetSummary;
use serde::{Deserialize, Serialize};

pub(crate) const DEFAULT_DISTANCE_METRIC: &str = "cosine";
pub(crate) const MAX_BACKFILL_ITEMS: usize = 1_000;

pub(crate) const UPSERT_EMBEDDING_MODEL_SQL: &str = "INSERT INTO chemd_embedding_models (
      embedding_model, embedding_dim, distance_metric
    ) VALUES ($1,$2,$3)
    ON CONFLICT (embedding_model) DO UPDATE SET
      embedding_dim = EXCLUDED.embedding_dim,
      distance_metric = EXCLUDED.distance_metric";

pub(crate) const UPSERT_CHUNK_EMBEDDING_SQL: &str = "INSERT INTO chemd_rag_chunk_embeddings (
      revision_id, chunk_id, embedding_model, embedding
    ) VALUES ($1,$2,$3,$4::vector)
    ON CONFLICT (revision_id, chunk_id, embedding_model) DO UPDATE SET
      embedding = EXCLUDED.embedding";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagEmbeddingBackfillRequest {
    pub(crate) workspace_id: Option<String>,
    #[serde(default)]
    pub(crate) embedding_model: String,
    pub(crate) embedding_dim: Option<i64>,
    pub(crate) distance_metric: Option<String>,
    #[serde(default)]
    pub(crate) items: Vec<PostgresRagEmbeddingBackfillItem>,
    pub(crate) dry_run: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagEmbeddingBackfillItem {
    #[serde(default)]
    pub(crate) revision_id: String,
    #[serde(default)]
    pub(crate) chunk_id: String,
    #[serde(default)]
    pub(crate) embedding: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagEmbeddingBackfillResult {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) target: Option<PostgresTargetSummary>,
    pub(crate) written_count: usize,
    pub(crate) skipped_count: usize,
    pub(crate) failed_count: usize,
    pub(crate) items: Vec<PostgresRagEmbeddingBackfillItemSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresRagEmbeddingBackfillItemSummary {
    pub(crate) input_index: usize,
    pub(crate) revision_id: Option<String>,
    pub(crate) chunk_id: Option<String>,
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) embedding_dim: Option<usize>,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedPostgresRagEmbeddingBackfill {
    pub(crate) workspace_id: Option<String>,
    pub(crate) embedding_model: String,
    pub(crate) embedding_dim: usize,
    pub(crate) distance_metric: String,
    pub(crate) dry_run: bool,
    pub(crate) valid_items: Vec<ValidatedPostgresRagEmbeddingBackfillItem>,
    pub(crate) failed_items: Vec<PostgresRagEmbeddingBackfillItemSummary>,
}

#[derive(Debug, Clone)]
pub(crate) struct ValidatedPostgresRagEmbeddingBackfillItem {
    pub(crate) input_index: usize,
    pub(crate) revision_id: String,
    pub(crate) chunk_id: String,
    pub(crate) embedding: Vec<f64>,
}

#[derive(Debug, Clone)]
pub(crate) struct PostgresRagEmbeddingBackfillSql {
    pub(crate) model_sql: &'static str,
    pub(crate) embedding_sql: &'static str,
}
