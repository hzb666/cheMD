use crate::{
    postgres_config::PostgresRuntimeConfig,
    postgres_rag::{
        build_postgres_rag_query_sql, clamp_limit, map_postgres_rag_rows,
        redact_postgres_rag_detail, validate_postgres_rag_query, vector_literal,
        PostgresRagCandidateRow, PostgresRagQueryInput,
    },
};

#[test]
fn postgres_rag_query_validation_rejects_empty_payload_fields() {
    let error = validate_postgres_rag_query(input("", "model", vec![0.1]))
        .expect_err("empty query should be rejected");
    assert!(error.contains("query"));

    let error = validate_postgres_rag_query(input("lookup", " ", vec![0.1]))
        .expect_err("empty embedding model should be rejected");
    assert!(error.contains("embeddingModel"));

    let mut request = input("lookup", "model", vec![0.1]);
    request.workspace_id = Some(" ".into());
    let error = validate_postgres_rag_query(request)
        .expect_err("blank optional filters should be rejected");
    assert!(error.contains("workspaceId"));
}

#[test]
fn postgres_rag_query_vector_validation_requires_finite_embedding() {
    assert_eq!(
        vector_literal(&[0.1, 0.2, 0.3]).expect("vector should serialize"),
        "[0.1,0.2,0.3]"
    );
    assert!(vector_literal(&[])
        .expect_err("empty vector should fail")
        .contains("empty"));
    assert!(vector_literal(&[f64::NAN])
        .expect_err("nan should fail")
        .contains("finite"));
}

#[test]
fn postgres_rag_query_clamps_limit() {
    assert_eq!(clamp_limit(None), 8);
    assert_eq!(clamp_limit(Some(-4)), 1);
    assert_eq!(clamp_limit(Some(0)), 1);
    assert_eq!(clamp_limit(Some(4)), 4);
    assert_eq!(clamp_limit(Some(200)), 20);
}

#[test]
fn postgres_rag_query_sql_joins_embeddings_chunks_citations_and_sources() {
    let mut request = input("lookup", "model-a", vec![0.1, 0.2]);
    request.workspace_id = Some("workspace-1".into());
    request.document_id = Some("doc-1".into());
    request.revision_id = Some("rev-1".into());
    request.limit = Some(99);
    let validated = validate_postgres_rag_query(request).expect("query should be valid");
    let sql = build_postgres_rag_query_sql(&validated).sql;

    assert!(sql.contains("FROM chemd_rag_chunk_embeddings e"));
    assert!(sql.contains("JOIN chemd_rag_chunks c"));
    assert!(sql.contains("LEFT JOIN chemd_rag_chunk_citations cit"));
    assert!(sql.contains("LEFT JOIN chemd_experiment_revisions r"));
    assert!(sql.contains("c.metadata->>'workspaceId' = $3"));
    assert!(sql.contains("c.metadata->>'documentId' = $4"));
    assert!(sql.contains("c.revision_id = $5"));
    assert!(sql.contains("LIMIT $6"));
    assert!(!sql.contains("CREATE TABLE"));
    assert!(!sql.contains("desktop_"));
}

#[test]
fn postgres_rag_query_blocks_rows_without_citation_locator_source() {
    let (results, blocked_count) = map_postgres_rag_rows(vec![
        candidate_row(
            Some(r#"{"citationId":"citation-1","documentUri":"file:///workspace/a.chemd"}"#),
            Some(r#"{"startLine":12,"endLine":14}"#),
        ),
        candidate_row(
            Some(r#"{"documentUri":"file:///workspace/no-id.chemd"}"#),
            Some(r#"{"startLine":12,"endLine":14}"#),
        ),
        candidate_row(Some(r#"{"citationId":"citation-no-range"}"#), Some("{}")),
        candidate_row(None, Some(r#"{"startLine":12,"endLine":14}"#)),
    ]);

    assert_eq!(blocked_count, 3);
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].chunk_id, "chunk-1");
    assert_eq!(
        results[0].citation.locator,
        "file:///workspace/a.chemd#citation-1:L12-L14"
    );
}

#[test]
fn postgres_rag_query_redacts_passwords_from_error_detail() {
    let config = PostgresRuntimeConfig {
        database_url: "postgres://chemd:secret-password@db.local/chemd".into(),
        source: "process env:CHEMD_POSTGRES_DATABASE_URL".into(),
        host: Some("db.local".into()),
        database: Some("chemd".into()),
        user: Some("chemd".into()),
        password: Some("secret-password".into()),
        ssl: "default".into(),
        timeout_ms: 5000,
        pool: None,
    };
    let detail = "failed postgres://chemd:secret-password@db.local/chemd with secret-password";
    let redacted = redact_postgres_rag_detail(detail, &config);

    assert!(!redacted.contains("secret-password"));
    assert!(!redacted.contains("postgres://chemd:secret-password@db.local/chemd"));
    assert!(redacted.contains("<redacted>"));
}

fn input(query: &str, embedding_model: &str, embedding: Vec<f64>) -> PostgresRagQueryInput {
    PostgresRagQueryInput {
        query: query.into(),
        embedding,
        embedding_model: embedding_model.into(),
        limit: None,
        workspace_id: None,
        document_id: None,
        revision_id: None,
    }
}

fn candidate_row(
    citation_json: Option<&str>,
    citation_source_range_json: Option<&str>,
) -> PostgresRagCandidateRow {
    PostgresRagCandidateRow {
        chunk_id: "chunk-1".into(),
        revision_id: "rev-1".into(),
        experiment_id: "exp-1".into(),
        chunk_type: "desktop_runtime_citation".into(),
        source_entity_ids: vec!["entity-1".into()],
        text: "reaction evidence".into(),
        metadata_json: r#"{"workspaceId":"workspace-1"}"#.into(),
        distance: 0.12,
        source_uri: Some("file:///workspace/fallback.chemd".into()),
        citation_source_range_json: citation_source_range_json.map(str::to_string),
        citation_json: citation_json.map(str::to_string),
        citation_quality_json: Some(r#"{"score":0.9}"#.into()),
        citation_entity_id: Some("entity-1".into()),
        citation_block_id: Some("block-1".into()),
    }
}
