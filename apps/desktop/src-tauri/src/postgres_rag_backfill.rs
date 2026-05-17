#![cfg_attr(test, allow(dead_code))]

use crate::{
    postgres::connect,
    postgres_config::{
        load_postgres_config, load_postgres_config_for_workspace, redact_config_detail,
        PostgresRuntimeConfig,
    },
    postgres_rag::vector_literal,
    postgres_rag_backfill_result::{
        all_items_failed_result, database_failure_result, offline_result, written_result,
    },
    postgres_rag_backfill_types::{
        PostgresRagEmbeddingBackfillResult, PostgresRagEmbeddingBackfillSql,
        ValidatedPostgresRagEmbeddingBackfill, UPSERT_CHUNK_EMBEDDING_SQL,
        UPSERT_EMBEDDING_MODEL_SQL,
    },
};
use postgres::Client;

#[cfg(not(test))]
use crate::workspace::CommandError;

pub(crate) use crate::postgres_rag_backfill_result::dry_run_result;
pub(crate) use crate::postgres_rag_backfill_result::redact_postgres_rag_backfill_detail;
#[cfg(test)]
pub(crate) use crate::postgres_rag_backfill_types::PostgresRagEmbeddingBackfillItem;
pub(crate) use crate::postgres_rag_backfill_types::PostgresRagEmbeddingBackfillRequest;
pub(crate) use crate::postgres_rag_backfill_validation::validate_postgres_rag_embedding_backfill;

#[cfg(not(test))]
#[tauri::command]
pub async fn backfill_postgres_rag_embeddings(
    input: PostgresRagEmbeddingBackfillRequest,
) -> Result<PostgresRagEmbeddingBackfillResult, CommandError> {
    match tauri::async_runtime::spawn_blocking(move || backfill_postgres_rag_embeddings_impl(input))
        .await
    {
        Ok(result) => Ok(result),
        Err(error) => Err(CommandError::new(
            "postgres_rag_embedding_backfill_task_failed",
            "Postgres RAG embedding backfill task failed",
            Some(error.to_string()),
        )),
    }
}

pub(crate) fn backfill_postgres_rag_embeddings_impl(
    input: PostgresRagEmbeddingBackfillRequest,
) -> PostgresRagEmbeddingBackfillResult {
    let validated = match validate_postgres_rag_embedding_backfill(input) {
        Ok(validated) => validated,
        Err(result) => return result,
    };
    if validated.valid_items.is_empty() {
        return all_items_failed_result(&validated);
    }

    let config = validated
        .workspace_id
        .as_deref()
        .map(|workspace_id| load_postgres_config_for_workspace(Some(workspace_id)))
        .unwrap_or_else(load_postgres_config);
    if validated.dry_run {
        return dry_run_result(&validated, config.as_ref());
    }
    let Some(config) = config else {
        return offline_result(&validated);
    };

    let mut client = match connect(&config) {
        Ok(client) => client,
        Err(detail) => return database_failure_result(&validated, &config, &detail),
    };
    match execute_postgres_rag_embedding_backfill(&mut client, &validated, &config) {
        Ok(written_count) => written_result(&validated, &config, written_count),
        Err(detail) => database_failure_result(&validated, &config, &detail),
    }
}

pub(crate) fn build_postgres_rag_embedding_backfill_sql() -> PostgresRagEmbeddingBackfillSql {
    PostgresRagEmbeddingBackfillSql {
        model_sql: UPSERT_EMBEDDING_MODEL_SQL,
        embedding_sql: UPSERT_CHUNK_EMBEDDING_SQL,
    }
}

fn execute_postgres_rag_embedding_backfill(
    client: &mut Client,
    input: &ValidatedPostgresRagEmbeddingBackfill,
    config: &PostgresRuntimeConfig,
) -> Result<usize, String> {
    let sql = build_postgres_rag_embedding_backfill_sql();
    let embedding_dim = i32::try_from(input.embedding_dim)
        .map_err(|_| "embeddingDim is too large for PostgreSQL integer".to_string())?;
    let mut tx = client
        .transaction()
        .map_err(|error| redact_config_detail(&error.to_string(), config))?;
    let operation = (|| {
        tx.execute(
            sql.model_sql,
            &[
                &input.embedding_model,
                &embedding_dim,
                &input.distance_metric,
            ],
        )?;
        for item in &input.valid_items {
            let embedding = vector_literal(&item.embedding).expect("validated embedding vector");
            tx.execute(
                sql.embedding_sql,
                &[
                    &item.revision_id,
                    &item.chunk_id,
                    &input.embedding_model,
                    &embedding,
                ],
            )?;
        }
        Ok::<(), postgres::Error>(())
    })();
    if let Err(error) = operation {
        let detail = redact_postgres_rag_backfill_detail(&error.to_string(), config);
        let _ = tx.rollback();
        return Err(detail);
    }
    tx.commit()
        .map_err(|error| redact_config_detail(&error.to_string(), config))?;
    Ok(input.valid_items.len())
}
