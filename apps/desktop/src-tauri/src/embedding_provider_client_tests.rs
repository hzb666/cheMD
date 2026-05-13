use crate::embedding_provider_batch::{
    build_embedding_provider_batch_request_specs, redact_embedding_provider_detail,
    CreateEmbeddingVectorItemInput, CreateEmbeddingVectorsInput,
};
use crate::embedding_provider_client::{
    build_embedding_provider_request_spec, parse_embedding_response, validate_embedding_vector,
    CreateEmbeddingVectorInput,
};
use serde_json::json;
use std::collections::BTreeMap;

#[test]
fn embedding_provider_client_builds_request_spec_from_env() {
    let spec = build_embedding_provider_request_spec(
        input(" aspirin synthesis "),
        &env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example/base"),
            ("CHEMD_EMBEDDING_PATH", "/v1/embeddings"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
            ("CHEMD_EMBEDDING_TIMEOUT_MS", "12000"),
            ("CHEMD_EMBEDDING_API_KEY", "sk-test-secret"),
        ]),
    )
    .expect("request spec");

    assert_eq!(
        spec.endpoint.as_str(),
        "https://embed.example/v1/embeddings"
    );
    assert_eq!(spec.payload.input, "aspirin synthesis");
    assert_eq!(spec.payload.model, "text-embedding-3-small");
    assert_eq!(spec.timeout_ms, 12_000);
    assert_eq!(spec.expected_dimension, 3);
    assert_eq!(spec.bearer_token.as_deref(), Some("sk-test-secret"));
}

#[test]
fn embedding_provider_client_accepts_relative_embedding_path() {
    let spec = build_embedding_provider_request_spec(
        input("query"),
        &env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example/api/"),
            ("CHEMD_EMBEDDING_PATH", "embeddings"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
        ]),
    )
    .expect("request spec");

    assert_eq!(
        spec.endpoint.as_str(),
        "https://embed.example/api/embeddings"
    );
}

#[test]
fn embedding_provider_client_rejects_blank_text_without_env_leak() {
    let result = build_embedding_provider_request_spec(
        input("  "),
        &env_map([
            (
                "CHEMD_EMBEDDING_BASE_URL",
                "https://user:secret@example.test/v1?token=secret",
            ),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
            ("CHEMD_EMBEDDING_API_KEY", "sk-test-secret"),
        ]),
    )
    .expect_err("blank text rejected");
    let serialized = serde_json::to_string(&result).expect("serializes");

    assert_eq!(result.state, "degraded");
    assert!(result.detail.contains("text must not be empty"));
    assert!(!serialized.contains("sk-test-secret"));
    assert!(!serialized.contains("secret@example"));
    assert!(!serialized.contains("token=secret"));
}

#[test]
fn embedding_provider_client_reports_missing_env_as_offline() {
    let result = build_embedding_provider_request_spec(input("query"), &BTreeMap::new())
        .expect_err("missing env rejected");

    assert_eq!(result.state, "offline");
    assert_eq!(result.provider_kind, "http_env");
    assert_eq!(result.model, None);
    assert!(result.embedding.is_empty());
}

#[test]
fn embedding_provider_client_builds_batch_request_specs_from_env() {
    let specs = build_embedding_provider_batch_request_specs(
        batch_input([("chunk-1", " aspirin "), ("chunk-2", " ibuprofen ")]),
        &env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example/base"),
            ("CHEMD_EMBEDDING_PATH", "/v1/embeddings"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
            ("CHEMD_EMBEDDING_TIMEOUT_MS", "12000"),
            ("CHEMD_EMBEDDING_API_KEY", "sk-test-secret"),
        ]),
    )
    .expect("batch request specs");

    assert_eq!(specs.specs.len(), 2);
    assert!(specs.invalid_items.is_empty());
    assert_eq!(specs.model, "text-embedding-3-small");
    assert_eq!(specs.expected_dimension, 3);
    assert_eq!(specs.specs[0].item_id, "chunk-1");
    assert_eq!(specs.specs[0].request.payload.input, "aspirin");
    assert_eq!(specs.specs[1].item_id, "chunk-2");
    assert_eq!(specs.specs[1].request.payload.input, "ibuprofen");
    assert_eq!(
        specs.specs[0].request.endpoint.as_str(),
        "https://embed.example/v1/embeddings"
    );
    assert_eq!(specs.specs[0].request.payload.model, "text-embedding-3-small");
    assert_eq!(specs.specs[0].request.expected_dimension, 3);
    assert_eq!(
        specs.specs[0].request.bearer_token.as_deref(),
        Some("sk-test-secret")
    );
}

#[test]
fn embedding_provider_client_keeps_valid_batch_items_when_others_are_blank() {
    let batch = build_embedding_provider_batch_request_specs(
        CreateEmbeddingVectorsInput {
            items: vec![
                CreateEmbeddingVectorItemInput {
                    id: "chunk-1".into(),
                    text: "  ".into(),
                },
                CreateEmbeddingVectorItemInput {
                    id: "  ".into(),
                    text: "super-secret provider body".into(),
                },
                CreateEmbeddingVectorItemInput {
                    id: "chunk-2".into(),
                    text: "ibuprofen".into(),
                },
            ],
            dry_run: None,
        },
        &env_map([
            (
                "CHEMD_EMBEDDING_BASE_URL",
                "https://user:secret@example.test/v1?token=secret",
            ),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
            ("CHEMD_EMBEDDING_API_KEY", "sk-test-secret"),
        ]),
    )
    .expect("valid batch items should still be requested");
    let serialized = serde_json::to_string(&batch.invalid_items).expect("serializes");

    assert_eq!(batch.specs.len(), 1);
    assert_eq!(batch.specs[0].item_id, "chunk-2");
    assert_eq!(batch.specs[0].request.payload.input, "ibuprofen");
    assert_eq!(batch.invalid_items.len(), 2);
    assert_eq!(batch.invalid_items[0].id, "chunk-1");
    assert!(batch.invalid_items[0].detail.contains("text must not be empty"));
    assert!(batch.invalid_items[1].detail.contains("id must not be empty"));
    assert!(!serialized.contains("super-secret provider body"));
    assert!(!serialized.contains("sk-test-secret"));
    assert!(!serialized.contains("secret@example"));
    assert!(!serialized.contains("token=secret"));
}

#[test]
fn embedding_provider_client_rejects_too_many_batch_items_before_request_specs() {
    let items = (0..101)
        .map(|index| CreateEmbeddingVectorItemInput {
            id: format!("chunk-{index}"),
            text: "query".into(),
        })
        .collect();
    let result = build_embedding_provider_batch_request_specs(
        CreateEmbeddingVectorsInput {
            items,
            dry_run: None,
        },
        &env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
        ]),
    )
    .expect_err("oversized batch rejected");

    assert_eq!(result.state, "degraded");
    assert!(result.detail.contains("exceeds max 100"));
    assert!(result.items.is_empty());
}

#[test]
fn embedding_provider_client_reports_batch_missing_env_as_offline_without_request_specs() {
    let result = build_embedding_provider_batch_request_specs(
        batch_input([("chunk-1", "aspirin"), ("chunk-2", "ibuprofen")]),
        &BTreeMap::new(),
    )
    .expect_err("missing env rejected");

    assert_eq!(result.state, "offline");
    assert_eq!(result.provider_kind, "http_env");
    assert_eq!(result.model, None);
    assert_eq!(result.items.len(), 2);
    assert!(result.items.iter().all(|item| item.state == "offline"));
    assert!(result.items.iter().all(|item| item.embedding.is_none()));
}

#[test]
fn embedding_provider_client_redacts_batch_provider_failure_details() {
    let redacted = redact_embedding_provider_detail(
        "provider body https://embed.example/v1 token=secret sk-test-secret",
    );

    assert_eq!(
        redacted,
        "Embedding provider request failed for item; provider details were redacted"
    );
    assert_eq!(
        redact_embedding_provider_detail("Embedding provider returned invalid JSON"),
        "Embedding provider returned invalid JSON"
    );
}

#[test]
fn embedding_provider_client_redacts_invalid_env_details() {
    let result = build_embedding_provider_request_spec(
        input("query"),
        &env_map([
            (
                "CHEMD_EMBEDDING_BASE_URL",
                "https://user:password@embed.example/v1?api_key=secret",
            ),
            (
                "CHEMD_EMBEDDING_PATH",
                "https://evil.example/embeddings?token=secret",
            ),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "3"),
            ("CHEMD_EMBEDDING_API_KEY", "sk-test-secret"),
        ]),
    )
    .expect_err("invalid path rejected");
    let serialized = serde_json::to_string(&result).expect("serializes");

    assert_eq!(result.state, "degraded");
    assert!(result.detail.contains("CHEMD_EMBEDDING_PATH"));
    assert!(!serialized.contains("sk-test-secret"));
    assert!(!serialized.contains("password"));
    assert!(!serialized.contains("api_key=secret"));
    assert!(!serialized.contains("evil.example"));
}

#[test]
fn embedding_provider_client_parses_direct_embedding_response() {
    let embedding = parse_embedding_response(&json!({ "embedding": [0.1, 0.2, 0.3] }))
        .expect("direct response parses");

    assert_eq!(embedding, vec![0.1, 0.2, 0.3]);
}

#[test]
fn embedding_provider_client_parses_openai_style_response() {
    let embedding =
        parse_embedding_response(&json!({ "data": [{ "embedding": [1.0, 2.0, 3.0] }] }))
            .expect("openai-style response parses");

    assert_eq!(embedding, vec![1.0, 2.0, 3.0]);
}

#[test]
fn embedding_provider_client_rejects_non_numeric_embedding_values() {
    let error = parse_embedding_response(&json!({ "embedding": [0.1, "bad"] }))
        .expect_err("non-numeric embedding rejected");

    assert!(error.contains("numbers"));
}

#[test]
fn embedding_provider_client_validates_finite_values_and_dimension() {
    let non_finite =
        validate_embedding_vector(&[0.1, f64::INFINITY], 2).expect_err("infinite value rejected");
    let mismatch = validate_embedding_vector(&[0.1, 0.2], 3).expect_err("dimension rejected");

    assert!(non_finite.contains("finite"));
    assert!(mismatch.contains("does not match expected dimension"));
}

fn input(text: &str) -> CreateEmbeddingVectorInput {
    CreateEmbeddingVectorInput { text: text.into() }
}

fn batch_input<const N: usize>(items: [(&str, &str); N]) -> CreateEmbeddingVectorsInput {
    CreateEmbeddingVectorsInput {
        items: items
            .into_iter()
            .map(|(id, text)| CreateEmbeddingVectorItemInput {
                id: id.into(),
                text: text.into(),
            })
            .collect(),
        dry_run: None,
    }
}

fn env_map<const N: usize>(items: [(&str, &str); N]) -> BTreeMap<String, String> {
    items
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}
