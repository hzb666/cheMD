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

    assert_eq!(spec.endpoint.as_str(), "https://embed.example/api/embeddings");
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

fn env_map<const N: usize>(items: [(&str, &str); N]) -> BTreeMap<String, String> {
    items
        .into_iter()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}
