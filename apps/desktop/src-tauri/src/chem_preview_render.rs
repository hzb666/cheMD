#![cfg_attr(test, allow(dead_code))]

#[cfg(not(test))]
use crate::sidecar::SidecarManager;
use crate::workspace::CommandError;
use serde::Deserialize;
use serde_json::{json, Value};
#[cfg(not(test))]
use std::time::Duration;

const CHEM_SERVICE_BASE_URL: &str = "http://127.0.0.1:18081";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ChemPreviewRenderInput {
    #[serde(rename = "type")]
    pub(crate) render_type: String,
    pub(crate) smiles: Option<String>,
    pub(crate) molfile: Option<String>,
    pub(crate) reactants: Option<Vec<String>>,
    pub(crate) products: Option<Vec<String>>,
    pub(crate) conditions: Option<Vec<String>>,
    pub(crate) render_options: Option<Value>,
}

#[cfg(not(test))]
#[tauri::command]
pub async fn render_chem_preview(
    input: ChemPreviewRenderInput,
    manager: tauri::State<'_, SidecarManager>,
) -> Result<Value, CommandError> {
    match request_render_payload(&input).await {
        Ok(payload) => Ok(payload),
        Err(RenderRequestFailure::Connection(_)) => {
            manager.start()?;
            request_render_payload(&input)
                .await
                .map_err(|failure| failure.into_error())
        }
        Err(failure) => Err(failure.into_error()),
    }
}

pub(crate) enum RenderRequestFailure {
    Connection(String),
    Service(String),
}

impl RenderRequestFailure {
    pub(crate) fn into_error(self) -> CommandError {
        match self {
            Self::Connection(detail) => CommandError::new(
                "chem_preview_render_unreachable",
                "chem-service render endpoint is unreachable",
                Some(detail),
            ),
            Self::Service(detail) => CommandError::new(
                "chem_preview_render_failed",
                "chem-service render endpoint failed",
                Some(detail),
            ),
        }
    }
}

#[cfg(not(test))]
async fn request_render_payload(
    input: &ChemPreviewRenderInput,
) -> Result<Value, RenderRequestFailure> {
    let endpoint = render_endpoint(input)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| RenderRequestFailure::Service(error.to_string()))?;
    let response = client
        .post(endpoint)
        .json(&render_request_body(input))
        .send()
        .await
        .map_err(|error| {
            if error.is_connect() || error.is_timeout() {
                RenderRequestFailure::Connection(error.to_string())
            } else {
                RenderRequestFailure::Service(error.to_string())
            }
        })?;
    let status = response.status();
    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| RenderRequestFailure::Service(error.to_string()))?;
    if !status.is_success() {
        return Err(RenderRequestFailure::Service(read_service_error(
            payload,
            status.as_u16(),
        )));
    }
    Ok(payload)
}

pub(crate) fn render_endpoint(
    input: &ChemPreviewRenderInput,
) -> Result<String, RenderRequestFailure> {
    match input.render_type.as_str() {
        "molecule" => Ok(format!("{CHEM_SERVICE_BASE_URL}/render")),
        "reaction" => Ok(format!("{CHEM_SERVICE_BASE_URL}/reaction/render")),
        other => Err(RenderRequestFailure::Service(format!(
            "unsupported preview render type: {other}"
        ))),
    }
}

pub(crate) fn render_request_body(input: &ChemPreviewRenderInput) -> Value {
    match input.render_type.as_str() {
        "reaction" => json!({
            "reactants": input.reactants.clone().unwrap_or_default(),
            "products": input.products.clone().unwrap_or_default(),
            "conditions": input.conditions.clone().unwrap_or_default(),
            "renderOptions": input.render_options.clone(),
        }),
        _ => json!({
            "smiles": input.smiles,
            "molfile": input.molfile,
            "renderOptions": input.render_options.clone(),
        }),
    }
}

pub(crate) fn read_service_error(payload: Value, status: u16) -> String {
    payload
        .get("message")
        .and_then(Value::as_str)
        .filter(|message| !message.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("chem-service render failed ({status})"))
}
