use crate::{
    postgres_config::PostgresRuntimeConfig,
    postgres_rag_backfill::{
        backfill_postgres_rag_embeddings_impl, build_postgres_rag_embedding_backfill_sql,
        dry_run_result, redact_postgres_rag_backfill_detail,
        validate_postgres_rag_embedding_backfill, PostgresRagEmbeddingBackfillItem,
        PostgresRagEmbeddingBackfillRequest,
    },
};

#[test]
fn postgres_rag_backfill_sql_upserts_shared_pgvector_tables() {
    let sql = build_postgres_rag_embedding_backfill_sql();

    assert!(sql.model_sql.contains("INSERT INTO chemd_embedding_models"));
    assert!(sql.model_sql.contains("ON CONFLICT (embedding_model)"));
    assert!(sql
        .embedding_sql
        .contains("INSERT INTO chemd_rag_chunk_embeddings"));
    assert!(sql.embedding_sql.contains("$4::vector"));
    assert!(sql
        .embedding_sql
        .contains("ON CONFLICT (revision_id, chunk_id, embedding_model)"));
    assert!(!sql.model_sql.contains("CREATE TABLE"));
    assert!(!sql.embedding_sql.contains("CREATE TABLE"));
    assert!(!sql.model_sql.contains("desktop_"));
    assert!(!sql.embedding_sql.contains("desktop_"));
}

#[test]
fn postgres_rag_backfill_validation_rejects_empty_and_oversized_requests() {
    let empty = validate_postgres_rag_embedding_backfill(request("model", None, vec![], false))
        .expect_err("empty item list should be rejected");
    assert_eq!(empty.state, "degraded");
    assert!(empty.detail.contains("items"));
    assert_eq!(empty.failed_count, 0);

    let blank_model = validate_postgres_rag_embedding_backfill(request(
        " ",
        None,
        vec![item("rev-1", "chunk-1", vec![0.1])],
        false,
    ))
    .expect_err("blank model should be rejected");
    assert!(blank_model.detail.contains("embeddingModel"));
    assert_eq!(blank_model.failed_count, 1);

    let too_many_items = (0..1001)
        .map(|index| item("rev-1", &format!("chunk-{index}"), vec![0.1]))
        .collect::<Vec<_>>();
    let too_many =
        validate_postgres_rag_embedding_backfill(request("model", None, too_many_items, false))
            .expect_err("oversized backfill should be rejected");
    assert!(too_many.detail.contains("must not exceed"));
    assert_eq!(too_many.failed_count, 1001);
}

#[test]
fn postgres_rag_backfill_validation_checks_dimensions_and_finite_vectors() {
    let validated = validate_postgres_rag_embedding_backfill(request(
        "model",
        Some(2),
        vec![
            item("rev-1", "chunk-1", vec![0.1, 0.2]),
            item("rev-1", "chunk-2", vec![0.3]),
            item("rev-1", "chunk-3", vec![f64::NAN, 0.4]),
            item(" ", "chunk-4", vec![0.5, 0.6]),
        ],
        false,
    ))
    .expect("mixed item validity should produce a validation summary");

    assert_eq!(validated.embedding_dim, 2);
    assert_eq!(validated.valid_items.len(), 1);
    assert_eq!(validated.failed_items.len(), 3);
    assert!(validated.failed_items[0].detail.contains("dimension"));
    assert!(validated.failed_items[1].detail.contains("finite"));
    assert!(validated.failed_items[2].detail.contains("revisionId"));
}

#[test]
fn postgres_rag_backfill_validation_infers_dimension_from_first_valid_item() {
    let validated = validate_postgres_rag_embedding_backfill(request(
        "model",
        None,
        vec![
            item("rev-1", "bad-empty", vec![]),
            item("rev-1", "chunk-1", vec![0.1, 0.2, 0.3]),
            item("rev-1", "chunk-2", vec![0.4, 0.5]),
        ],
        false,
    ))
    .expect("dimension should be inferred from the first valid vector");

    assert_eq!(validated.embedding_dim, 3);
    assert_eq!(validated.valid_items.len(), 1);
    assert_eq!(validated.failed_items.len(), 2);
    assert_eq!(validated.valid_items[0].chunk_id, "chunk-1");
}

#[test]
fn postgres_rag_backfill_dry_run_does_not_require_database_writes() {
    let result = backfill_postgres_rag_embeddings_impl(request(
        "model",
        Some(2),
        vec![
            item("rev-1", "chunk-1", vec![0.1, 0.2]),
            item("rev-1", "bad", vec![0.3]),
        ],
        true,
    ));

    assert_eq!(result.state, "degraded");
    assert_eq!(result.written_count, 0);
    assert_eq!(result.skipped_count, 1);
    assert_eq!(result.failed_count, 1);
    assert_eq!(result.items[0].state, "skipped");
    assert_eq!(result.items[1].state, "failed");
    assert!(result.detail.contains("no database writes"));
}

#[test]
fn postgres_rag_backfill_dry_run_result_reports_target_without_writing() {
    let validated = validate_postgres_rag_embedding_backfill(request(
        "model",
        Some(1),
        vec![item("rev-1", "chunk-1", vec![0.1])],
        true,
    ))
    .expect("request should validate");
    let config = config();
    let result = dry_run_result(&validated, Some(&config));

    assert_eq!(result.state, "ready");
    assert_eq!(result.skipped_count, 1);
    assert_eq!(
        result.target.expect("target should be summarized").database,
        Some("chemd".into())
    );
}

#[test]
fn postgres_rag_backfill_redacts_passwords_from_error_detail() {
    let config = config();
    let detail = "failed postgres://chemd:secret-password@db.local/chemd with secret-password";
    let redacted = redact_postgres_rag_backfill_detail(detail, &config);

    assert!(!redacted.contains("secret-password"));
    assert!(!redacted.contains("postgres://chemd:secret-password@db.local/chemd"));
    assert!(redacted.contains("<redacted>"));
}

fn request(
    embedding_model: &str,
    embedding_dim: Option<i64>,
    items: Vec<PostgresRagEmbeddingBackfillItem>,
    dry_run: bool,
) -> PostgresRagEmbeddingBackfillRequest {
    PostgresRagEmbeddingBackfillRequest {
        workspace_id: None,
        embedding_model: embedding_model.into(),
        embedding_dim,
        distance_metric: None,
        items,
        dry_run: Some(dry_run),
    }
}

fn item(
    revision_id: &str,
    chunk_id: &str,
    embedding: Vec<f64>,
) -> PostgresRagEmbeddingBackfillItem {
    PostgresRagEmbeddingBackfillItem {
        revision_id: revision_id.into(),
        chunk_id: chunk_id.into(),
        embedding,
    }
}

fn config() -> PostgresRuntimeConfig {
    PostgresRuntimeConfig {
        database_url: "postgres://chemd:secret-password@db.local/chemd".into(),
        source: "process env:CHEMD_POSTGRES_DATABASE_URL".into(),
        host: Some("db.local".into()),
        database: Some("chemd".into()),
        user: Some("chemd".into()),
        password: Some("secret-password".into()),
        ssl: "default".into(),
        timeout_ms: 5000,
        pool: None,
    }
}
