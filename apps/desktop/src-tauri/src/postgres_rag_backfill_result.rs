#![cfg_attr(test, allow(dead_code))]

use crate::{
    postgres_config::{redact_config_detail, PostgresRuntimeConfig},
    postgres_rag_backfill_types::{
        PostgresRagEmbeddingBackfillItemSummary, PostgresRagEmbeddingBackfillResult,
        ValidatedPostgresRagEmbeddingBackfill,
    },
    postgres_runtime_types::PostgresTargetSummary,
};

pub(crate) fn written_result(
    input: &ValidatedPostgresRagEmbeddingBackfill,
    config: &PostgresRuntimeConfig,
    written_count: usize,
) -> PostgresRagEmbeddingBackfillResult {
    let mut items = input.failed_items.clone();
    items.extend(input.valid_items.iter().map(|item| {
        item_summary(
            item.input_index,
            Some(item.revision_id.clone()),
            Some(item.chunk_id.clone()),
            "ready",
            "Embedding written",
            "Embedding upserted into shared pgvector schema".into(),
            Some(item.embedding.len()),
        )
    }));
    finalize_result(
        if input.failed_items.is_empty() {
            "ready"
        } else {
            "degraded"
        },
        if input.failed_items.is_empty() {
            "Postgres RAG embeddings written"
        } else {
            "Postgres RAG embeddings partially written"
        },
        format!(
            "Wrote {written_count} embeddings for model {}",
            input.embedding_model
        ),
        Some(target_summary(config)),
        written_count,
        0,
        input.failed_items.len(),
        items,
    )
}

pub(crate) fn dry_run_result(
    input: &ValidatedPostgresRagEmbeddingBackfill,
    config: Option<&PostgresRuntimeConfig>,
) -> PostgresRagEmbeddingBackfillResult {
    let mut items = input.failed_items.clone();
    items.extend(input.valid_items.iter().map(|item| {
        item_summary(
            item.input_index,
            Some(item.revision_id.clone()),
            Some(item.chunk_id.clone()),
            "skipped",
            "Dry run validated",
            "Dry run requested; no database write was attempted".into(),
            Some(item.embedding.len()),
        )
    }));
    finalize_result(
        if input.failed_items.is_empty() {
            "ready"
        } else {
            "degraded"
        },
        "Postgres RAG embedding dry run",
        format!(
            "Validated {} embeddings for model {}; no database writes were attempted",
            input.valid_items.len(),
            input.embedding_model
        ),
        config.map(target_summary),
        0,
        input.valid_items.len(),
        input.failed_items.len(),
        items,
    )
}

pub(crate) fn offline_result(
    input: &ValidatedPostgresRagEmbeddingBackfill,
) -> PostgresRagEmbeddingBackfillResult {
    let mut items = input.failed_items.clone();
    items.extend(input.valid_items.iter().map(|item| {
        item_summary(
            item.input_index,
            Some(item.revision_id.clone()),
            Some(item.chunk_id.clone()),
            "skipped",
            "Postgres offline",
            "No active PostgreSQL target is configured for embedding backfill".into(),
            Some(item.embedding.len()),
        )
    }));
    finalize_result(
        "offline",
        "Postgres RAG embedding backfill offline",
        "No active PostgreSQL target is configured for embedding backfill".into(),
        None,
        0,
        input.valid_items.len(),
        input.failed_items.len(),
        items,
    )
}

pub(crate) fn database_failure_result(
    input: &ValidatedPostgresRagEmbeddingBackfill,
    config: &PostgresRuntimeConfig,
    detail: &str,
) -> PostgresRagEmbeddingBackfillResult {
    let redacted = redact_postgres_rag_backfill_detail(detail, config);
    let mut items = input.failed_items.clone();
    items.extend(input.valid_items.iter().map(|item| {
        item_summary(
            item.input_index,
            Some(item.revision_id.clone()),
            Some(item.chunk_id.clone()),
            "failed",
            "Embedding write failed",
            redacted.clone(),
            Some(item.embedding.len()),
        )
    }));
    finalize_result(
        "degraded",
        "Postgres RAG embedding backfill degraded",
        redacted,
        Some(target_summary(config)),
        0,
        0,
        input.failed_items.len() + input.valid_items.len(),
        items,
    )
}

pub(crate) fn all_items_failed_result(
    input: &ValidatedPostgresRagEmbeddingBackfill,
) -> PostgresRagEmbeddingBackfillResult {
    finalize_result(
        "degraded",
        "Postgres RAG embedding backfill rejected",
        "No valid embeddings were provided".into(),
        None,
        0,
        0,
        input.failed_items.len(),
        input.failed_items.clone(),
    )
}

pub(crate) fn request_failed_result(
    item_count: usize,
    detail: String,
) -> PostgresRagEmbeddingBackfillResult {
    finalize_result(
        "degraded",
        "Postgres RAG embedding backfill rejected",
        detail,
        None,
        0,
        0,
        item_count,
        Vec::new(),
    )
}

pub(crate) fn item_summary(
    input_index: usize,
    revision_id: Option<String>,
    chunk_id: Option<String>,
    state: &str,
    label: &str,
    detail: String,
    embedding_dim: Option<usize>,
) -> PostgresRagEmbeddingBackfillItemSummary {
    PostgresRagEmbeddingBackfillItemSummary {
        input_index,
        revision_id,
        chunk_id,
        state: state.into(),
        label: label.into(),
        detail,
        embedding_dim,
    }
}

pub(crate) fn optional_string(value: String) -> Option<String> {
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

pub(crate) fn redact_postgres_rag_backfill_detail(
    detail: &str,
    config: &PostgresRuntimeConfig,
) -> String {
    redact_config_detail(detail, config)
}

fn finalize_result(
    state: &str,
    label: &str,
    detail: String,
    target: Option<PostgresTargetSummary>,
    written_count: usize,
    skipped_count: usize,
    failed_count: usize,
    mut items: Vec<PostgresRagEmbeddingBackfillItemSummary>,
) -> PostgresRagEmbeddingBackfillResult {
    items.sort_by_key(|item| item.input_index);
    PostgresRagEmbeddingBackfillResult {
        state: state.into(),
        label: label.into(),
        detail,
        target,
        written_count,
        skipped_count,
        failed_count,
        items,
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
