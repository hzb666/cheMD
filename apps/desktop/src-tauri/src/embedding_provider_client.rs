#![cfg_attr(test, allow(dead_code))]

#[cfg(not(test))]
use crate::embedding_provider_status::collect_embedding_env;
#[cfg(not(test))]
use crate::embedding_provider_batch::{
    batch_item_degraded, batch_item_ready, batch_result_from_items,
    build_embedding_provider_batch_request_specs, redact_embedding_provider_detail,
    CreateEmbeddingVectorsInput, CreateEmbeddingVectorsResult,
};
use crate::embedding_provider_status::{
    embedding_env_configured, embedding_status_detail, read_embedding_provider_config_from_env,
    EmbeddingProviderConfig, PROVIDER_KIND,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
#[cfg(not(test))]
use std::time::Duration;
use url::Url;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorInput {
    pub(crate) text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorResult {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) provider_kind: String,
    pub(crate) model: Option<String>,
    pub(crate) embedding: Vec<f64>,
    pub(crate) dimension: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EmbeddingProviderPayload {
    pub(crate) input: String,
    pub(crate) model: String,
}

#[derive(Debug, Clone)]
pub(crate) struct EmbeddingProviderRequestSpec {
    pub(crate) endpoint: Url,
    pub(crate) payload: EmbeddingProviderPayload,
    pub(crate) timeout_ms: u64,
    pub(crate) bearer_token: Option<String>,
    pub(crate) expected_dimension: usize,
}

#[cfg(not(test))]
#[tauri::command]
pub async fn create_embedding_vector(
    input: CreateEmbeddingVectorInput,
) -> CreateEmbeddingVectorResult {
    create_embedding_vector_impl(input).await
}

#[cfg(not(test))]
#[tauri::command]
pub async fn create_embedding_vectors(
    input: CreateEmbeddingVectorsInput,
) -> CreateEmbeddingVectorsResult {
    create_embedding_vectors_impl(input).await
}

#[cfg(not(test))]
async fn create_embedding_vector_impl(
    input: CreateEmbeddingVectorInput,
) -> CreateEmbeddingVectorResult {
    let vars = collect_embedding_env();
    let spec = match build_embedding_provider_request_spec(input, &vars) {
        Ok(spec) => spec,
        Err(result) => return result,
    };
    let model = spec.payload.model.clone();
    match execute_embedding_provider_request(&spec).await {
        Ok(embedding) => ready_result(model, embedding),
        Err(detail) => degraded_result("Embedding provider degraded", detail, Some(model), None),
    }
}

#[cfg(not(test))]
async fn create_embedding_vectors_impl(
    input: CreateEmbeddingVectorsInput,
) -> CreateEmbeddingVectorsResult {
    let vars = collect_embedding_env();
    let batch = match build_embedding_provider_batch_request_specs(input, &vars) {
        Ok(batch) => batch,
        Err(result) => return result,
    };
    let mut items = batch.invalid_items;
    for spec in &batch.specs {
        let item = match execute_embedding_provider_request(&spec.request).await {
            Ok(embedding) => batch_item_ready(spec.item_id.clone(), embedding),
            Err(detail) => batch_item_degraded(
                spec.item_id.clone(),
                "Embedding item degraded",
                redact_embedding_provider_detail(&detail),
                None,
            ),
        };
        items.push(item);
    }
    batch_result_from_items(Some(batch.model), Some(batch.expected_dimension), items)
}

#[cfg(not(test))]
async fn execute_embedding_provider_request(
    spec: &EmbeddingProviderRequestSpec,
) -> Result<Vec<f64>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(spec.timeout_ms.max(1)))
        .build()
        .map_err(|_| "Failed to initialize embedding provider request".to_string())?;
    let mut request = client.post(spec.endpoint.clone()).json(&spec.payload);
    if let Some(token) = spec.bearer_token.as_deref() {
        request = request.bearer_auth(token);
    }
    let response = request
        .send()
        .await
        .map_err(|error| provider_request_error(error.is_timeout()))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Embedding provider returned HTTP {}; response body was redacted",
            status.as_u16()
        ));
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "Embedding provider returned invalid JSON".to_string())?;
    let embedding = parse_embedding_response(&value)?;
    validate_embedding_vector(&embedding, spec.expected_dimension)?;
    Ok(embedding)
}

pub(crate) fn build_embedding_provider_request_spec(
    input: CreateEmbeddingVectorInput,
    vars: &BTreeMap<String, String>,
) -> Result<EmbeddingProviderRequestSpec, CreateEmbeddingVectorResult> {
    let text = input.text.trim().to_string();
    if text.is_empty() {
        return Err(degraded_result(
            "Embedding vector rejected",
            "text must not be empty".into(),
            None,
            None,
        ));
    }
    let config = match read_embedding_provider_config_from_env(vars) {
        Ok(config) => config,
        Err(issues) => return Err(config_error_result(vars, &issues)),
    };
    Ok(request_spec(text, config))
}

pub(crate) fn parse_embedding_response(value: &Value) -> Result<Vec<f64>, String> {
    if let Some(array) = value.get("embedding").and_then(Value::as_array) {
        return parse_embedding_array(array);
    }
    if let Some(array) = value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|items| items.first())
        .and_then(|item| item.get("embedding"))
        .and_then(Value::as_array)
    {
        return parse_embedding_array(array);
    }
    Err("Embedding provider response did not include an embedding vector".into())
}

pub(crate) fn validate_embedding_vector(
    embedding: &[f64],
    expected_dimension: usize,
) -> Result<(), String> {
    if embedding.is_empty() {
        return Err("embedding vector must not be empty".into());
    }
    if embedding.iter().any(|value| !value.is_finite()) {
        return Err("embedding vector values must be finite numbers".into());
    }
    if embedding.len() != expected_dimension {
        return Err(format!(
            "embedding dimension {} does not match expected dimension {}",
            embedding.len(),
            expected_dimension
        ));
    }
    Ok(())
}

fn request_spec(text: String, config: EmbeddingProviderConfig) -> EmbeddingProviderRequestSpec {
    EmbeddingProviderRequestSpec {
        endpoint: config.endpoint,
        payload: EmbeddingProviderPayload {
            input: text,
            model: config.model,
        },
        timeout_ms: config.timeout_ms,
        bearer_token: config.api_key,
        expected_dimension: config.embedding_dim,
    }
}

fn parse_embedding_array(array: &[Value]) -> Result<Vec<f64>, String> {
    array
        .iter()
        .map(|value| {
            value
                .as_f64()
                .ok_or_else(|| "embedding vector values must be numbers".to_string())
        })
        .collect()
}

fn config_error_result(
    vars: &BTreeMap<String, String>,
    issues: &[&str],
) -> CreateEmbeddingVectorResult {
    let state = if embedding_env_configured(vars) {
        "degraded"
    } else {
        "offline"
    };
    degraded_result(
        if state == "offline" {
            "Embedding provider offline"
        } else {
            "Embedding provider degraded"
        },
        embedding_status_detail(state, issues),
        None,
        None,
    )
}

fn ready_result(model: String, embedding: Vec<f64>) -> CreateEmbeddingVectorResult {
    CreateEmbeddingVectorResult {
        state: "ready".into(),
        label: "Embedding vector created".into(),
        detail: format!(
            "Generated embedding vector with configured model and dimension {}",
            embedding.len()
        ),
        provider_kind: PROVIDER_KIND.into(),
        model: Some(model),
        dimension: Some(embedding.len()),
        embedding,
    }
}

fn degraded_result(
    label: &str,
    detail: String,
    model: Option<String>,
    dimension: Option<usize>,
) -> CreateEmbeddingVectorResult {
    CreateEmbeddingVectorResult {
        state: if label.ends_with("offline") {
            "offline".into()
        } else {
            "degraded".into()
        },
        label: label.into(),
        detail,
        provider_kind: PROVIDER_KIND.into(),
        model,
        embedding: Vec::new(),
        dimension,
    }
}

#[cfg(not(test))]
fn provider_request_error(timed_out: bool) -> String {
    if timed_out {
        return "Embedding provider request timed out; provider error details were redacted".into();
    }
    "Embedding provider request failed; provider error details were redacted".into()
}
