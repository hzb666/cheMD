#![cfg_attr(test, allow(dead_code))]

use crate::{
    embedding_provider_client::{EmbeddingProviderPayload, EmbeddingProviderRequestSpec},
    embedding_provider_status::{
        embedding_env_configured, embedding_status_detail, read_embedding_provider_config_from_env,
        PROVIDER_KIND,
    },
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const MAX_EMBEDDING_BATCH_ITEMS: usize = 100;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorsInput {
    pub(crate) items: Vec<CreateEmbeddingVectorItemInput>,
    pub(crate) dry_run: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorItemInput {
    pub(crate) id: String,
    pub(crate) text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorsResult {
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) provider_kind: String,
    pub(crate) model: Option<String>,
    pub(crate) dimension: Option<usize>,
    pub(crate) items: Vec<CreateEmbeddingVectorItemResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateEmbeddingVectorItemResult {
    pub(crate) id: String,
    pub(crate) state: String,
    pub(crate) label: String,
    pub(crate) detail: String,
    pub(crate) embedding: Option<Vec<f64>>,
    pub(crate) dimension: Option<usize>,
}

#[derive(Debug, Clone)]
pub(crate) struct EmbeddingProviderBatchRequestSpec {
    pub(crate) item_id: String,
    pub(crate) request: EmbeddingProviderRequestSpec,
}

#[derive(Debug, Clone)]
pub(crate) struct EmbeddingProviderBatchRequestSpecs {
    pub(crate) specs: Vec<EmbeddingProviderBatchRequestSpec>,
    pub(crate) invalid_items: Vec<CreateEmbeddingVectorItemResult>,
    pub(crate) model: String,
    pub(crate) expected_dimension: usize,
}

pub(crate) fn build_embedding_provider_batch_request_specs(
    input: CreateEmbeddingVectorsInput,
    vars: &BTreeMap<String, String>,
) -> Result<EmbeddingProviderBatchRequestSpecs, CreateEmbeddingVectorsResult> {
    let _dry_run = input.dry_run.unwrap_or(false);
    if input.items.is_empty() {
        return Err(batch_degraded_result(
            "Embedding batch rejected",
            "items must not be empty".into(),
            None,
            None,
            Vec::new(),
        ));
    }
    if input.items.len() > MAX_EMBEDDING_BATCH_ITEMS {
        return Err(batch_degraded_result(
            "Embedding batch rejected",
            format!(
                "items length {} exceeds max {}",
                input.items.len(),
                MAX_EMBEDDING_BATCH_ITEMS
            ),
            None,
            None,
            Vec::new(),
        ));
    }

    let (invalid_items, valid_items) = split_batch_items(input.items);
    let config = match read_embedding_provider_config_from_env(vars) {
        Ok(config) => config,
        Err(issues) => {
            let state = if embedding_env_configured(vars) {
                "degraded"
            } else {
                "offline"
            };
            let label = if state == "offline" {
                "Embedding provider offline"
            } else {
                "Embedding provider degraded"
            };
            let detail = embedding_status_detail(state, &issues);
            let mut items = invalid_items;
            items.extend(valid_items.into_iter().map(|item| {
                batch_item_degraded(item.id, label, detail.clone(), None)
            }));
            return Err(batch_result_from_state(
                state.into(),
                label.into(),
                detail,
                None,
                None,
                items,
            ));
        }
    };

    if valid_items.is_empty() {
        return Err(batch_result_from_items(
            Some(config.model),
            Some(config.embedding_dim),
            invalid_items,
        ));
    }

    let specs = valid_items
        .into_iter()
        .map(|item| EmbeddingProviderBatchRequestSpec {
            item_id: item.id,
            request: EmbeddingProviderRequestSpec {
                endpoint: config.endpoint.clone(),
                payload: EmbeddingProviderPayload {
                    input: item.text,
                    model: config.model.clone(),
                },
                timeout_ms: config.timeout_ms,
                bearer_token: config.api_key.clone(),
                expected_dimension: config.embedding_dim,
            },
        })
        .collect::<Vec<_>>();
    Ok(EmbeddingProviderBatchRequestSpecs {
        specs,
        invalid_items,
        model: config.model,
        expected_dimension: config.embedding_dim,
    })
}

fn split_batch_items(
    items: Vec<CreateEmbeddingVectorItemInput>,
) -> (Vec<CreateEmbeddingVectorItemResult>, Vec<CreateEmbeddingVectorItemInput>) {
    let mut invalid_items = Vec::new();
    let mut valid_items = Vec::new();
    for item in items {
        let id = item.id.trim().to_string();
        let text = item.text.trim().to_string();
        if id.is_empty() {
            invalid_items.push(batch_item_degraded(
                id,
                "Embedding item rejected",
                "id must not be empty".into(),
                None,
            ));
        } else if text.is_empty() {
            invalid_items.push(batch_item_degraded(
                id,
                "Embedding item rejected",
                "text must not be empty".into(),
                None,
            ));
        } else {
            valid_items.push(CreateEmbeddingVectorItemInput { id, text });
        }
    }
    (invalid_items, valid_items)
}

pub(crate) fn batch_result_from_items(
    model: Option<String>,
    dimension: Option<usize>,
    items: Vec<CreateEmbeddingVectorItemResult>,
) -> CreateEmbeddingVectorsResult {
    let state = if items.iter().all(|item| item.state == "ready") {
        "ready"
    } else if items.iter().all(|item| item.state == "offline") {
        "offline"
    } else {
        "degraded"
    };
    let ready_count = items.iter().filter(|item| item.state == "ready").count();
    let failed_count = items.len().saturating_sub(ready_count);
    batch_result_from_state(
        state.into(),
        if state == "ready" {
            "Embedding vectors created".into()
        } else {
            "Embedding batch degraded".into()
        },
        format!(
            "Processed {} embedding item(s): {} ready, {} degraded",
            items.len(),
            ready_count,
            failed_count
        ),
        model,
        dimension,
        items,
    )
}

fn batch_result_from_state(
    state: String,
    label: String,
    detail: String,
    model: Option<String>,
    dimension: Option<usize>,
    items: Vec<CreateEmbeddingVectorItemResult>,
) -> CreateEmbeddingVectorsResult {
    CreateEmbeddingVectorsResult { state, label, detail, provider_kind: PROVIDER_KIND.into(), model, dimension, items }
}

fn batch_degraded_result(
    label: &str,
    detail: String,
    model: Option<String>,
    dimension: Option<usize>,
    items: Vec<CreateEmbeddingVectorItemResult>,
) -> CreateEmbeddingVectorsResult {
    batch_result_from_state("degraded".into(), label.into(), detail, model, dimension, items)
}

pub(crate) fn batch_item_ready(id: String, embedding: Vec<f64>) -> CreateEmbeddingVectorItemResult {
    CreateEmbeddingVectorItemResult {
        id,
        state: "ready".into(),
        label: "Embedding vector created".into(),
        detail: format!(
            "Generated embedding vector with configured model and dimension {}",
            embedding.len()
        ),
        dimension: Some(embedding.len()),
        embedding: Some(embedding),
    }
}

pub(crate) fn batch_item_degraded(
    id: String,
    label: &str,
    detail: String,
    dimension: Option<usize>,
) -> CreateEmbeddingVectorItemResult {
    let state = if label.ends_with("offline") { "offline" } else { "degraded" };
    CreateEmbeddingVectorItemResult {
        id,
        state: state.into(),
        label: label.into(),
        detail,
        embedding: None,
        dimension,
    }
}

pub(crate) fn redact_embedding_provider_detail(detail: &str) -> String {
    const SAFE_PREFIXES: [&str; 8] = [
        "Embedding provider returned HTTP ",
        "Embedding provider returned invalid JSON",
        "Embedding provider response did not include an embedding vector",
        "embedding vector must not be empty",
        "embedding vector values must be finite numbers",
        "embedding vector values must be numbers",
        "embedding dimension ",
        "Embedding provider request ",
    ];
    if SAFE_PREFIXES
        .iter()
        .any(|prefix| detail.starts_with(prefix))
        && !contains_sensitive_marker(detail)
    {
        return detail.into();
    }
    "Embedding provider request failed for item; provider details were redacted".into()
}

fn contains_sensitive_marker(detail: &str) -> bool {
    let lowered = detail.to_ascii_lowercase();
    ["http://", "https://", "api_key", "token", "password", "authorization", "bearer"]
        .iter()
        .any(|marker| lowered.contains(marker))
        || detail.contains("sk-")
}
