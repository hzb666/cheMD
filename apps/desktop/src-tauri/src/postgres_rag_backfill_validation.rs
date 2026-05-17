#![cfg_attr(test, allow(dead_code))]

use crate::{
    postgres_rag::vector_literal,
    postgres_rag_backfill_result::{item_summary, optional_string, request_failed_result},
    postgres_rag_backfill_types::{
        PostgresRagEmbeddingBackfillItem, PostgresRagEmbeddingBackfillItemSummary,
        PostgresRagEmbeddingBackfillRequest, PostgresRagEmbeddingBackfillResult,
        ValidatedPostgresRagEmbeddingBackfill, ValidatedPostgresRagEmbeddingBackfillItem,
        DEFAULT_DISTANCE_METRIC, MAX_BACKFILL_ITEMS,
    },
};

pub(crate) fn validate_postgres_rag_embedding_backfill(
    input: PostgresRagEmbeddingBackfillRequest,
) -> Result<ValidatedPostgresRagEmbeddingBackfill, PostgresRagEmbeddingBackfillResult> {
    let embedding_model = input.embedding_model.trim().to_string();
    let distance_metric = normalize_distance_metric(input.distance_metric.as_deref());
    let explicit_dim = match normalize_embedding_dim(input.embedding_dim) {
        Ok(dim) => dim,
        Err(detail) => return Err(request_failed_result(input.items.len(), detail)),
    };

    validate_request_shape(&embedding_model, &distance_metric, input.items.len())?;

    let (embedding_dim, valid_items, failed_items) =
        validate_backfill_items(input.items, explicit_dim);
    Ok(ValidatedPostgresRagEmbeddingBackfill {
        workspace_id: input
            .workspace_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        embedding_model,
        embedding_dim: embedding_dim.unwrap_or_else(|| explicit_dim.unwrap_or(0)),
        distance_metric,
        dry_run: input.dry_run.unwrap_or(false),
        valid_items,
        failed_items,
    })
}

fn validate_request_shape(
    embedding_model: &str,
    distance_metric: &str,
    item_count: usize,
) -> Result<(), PostgresRagEmbeddingBackfillResult> {
    if embedding_model.is_empty() {
        return Err(request_failed_result(
            item_count,
            "embeddingModel must not be empty".into(),
        ));
    }
    if item_count == 0 {
        return Err(request_failed_result(
            0,
            "items must contain at least one embedding".into(),
        ));
    }
    if item_count > MAX_BACKFILL_ITEMS {
        return Err(request_failed_result(
            item_count,
            format!("items must not exceed {MAX_BACKFILL_ITEMS} entries"),
        ));
    }
    if !is_supported_distance_metric(distance_metric) {
        return Err(request_failed_result(
            item_count,
            format!("distanceMetric is not supported: {distance_metric}"),
        ));
    }
    Ok(())
}

fn validate_backfill_items(
    items: Vec<PostgresRagEmbeddingBackfillItem>,
    explicit_dim: Option<usize>,
) -> (
    Option<usize>,
    Vec<ValidatedPostgresRagEmbeddingBackfillItem>,
    Vec<PostgresRagEmbeddingBackfillItemSummary>,
) {
    let mut inferred_dim = explicit_dim;
    let mut valid_items = Vec::new();
    let mut failed_items = Vec::new();
    for (input_index, item) in items.into_iter().enumerate() {
        match validate_backfill_item(input_index, item, inferred_dim) {
            Ok((valid_item, item_dim)) => {
                inferred_dim.get_or_insert(item_dim);
                valid_items.push(valid_item);
            }
            Err(summary) => failed_items.push(summary),
        }
    }
    (inferred_dim, valid_items, failed_items)
}

fn validate_backfill_item(
    input_index: usize,
    item: PostgresRagEmbeddingBackfillItem,
    expected_dim: Option<usize>,
) -> Result<
    (ValidatedPostgresRagEmbeddingBackfillItem, usize),
    PostgresRagEmbeddingBackfillItemSummary,
> {
    let revision_id = item.revision_id.trim().to_string();
    let chunk_id = item.chunk_id.trim().to_string();
    let errors = item_errors(&revision_id, &chunk_id, &item.embedding, expected_dim);
    if !errors.is_empty() {
        return Err(item_summary(
            input_index,
            optional_string(revision_id),
            optional_string(chunk_id),
            "failed",
            "Embedding rejected",
            errors.join("; "),
            Some(item.embedding.len()).filter(|value| *value > 0),
        ));
    }
    let item_dim = item.embedding.len();
    Ok((
        ValidatedPostgresRagEmbeddingBackfillItem {
            input_index,
            revision_id,
            chunk_id,
            embedding: item.embedding,
        },
        item_dim,
    ))
}

fn item_errors(
    revision_id: &str,
    chunk_id: &str,
    embedding: &[f64],
    expected_dim: Option<usize>,
) -> Vec<String> {
    let mut errors = Vec::new();
    if revision_id.is_empty() {
        errors.push("revisionId must not be empty".into());
    }
    if chunk_id.is_empty() {
        errors.push("chunkId must not be empty".into());
    }
    if let Err(detail) = vector_literal(embedding) {
        errors.push(detail);
    }
    if matches!(expected_dim, Some(dim) if !embedding.is_empty() && embedding.len() != dim) {
        errors.push("embedding dimension does not match request dimension".into());
    }
    errors
}

fn normalize_embedding_dim(value: Option<i64>) -> Result<Option<usize>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value <= 0 {
        return Err("embeddingDim must be a positive integer".into());
    }
    usize::try_from(value)
        .map(Some)
        .map_err(|_| "embeddingDim is too large".into())
}

fn normalize_distance_metric(value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_DISTANCE_METRIC)
        .to_string()
}

fn is_supported_distance_metric(value: &str) -> bool {
    matches!(value, "cosine" | "l2" | "inner_product")
}
