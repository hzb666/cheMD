#![cfg_attr(test, allow(dead_code))]

use serde::Serialize;
use std::{collections::BTreeMap, env};
use url::Url;

pub(crate) const PROVIDER_KIND: &str = "http_env";
const DEFAULT_DISTANCE_METRIC: &str = "cosine";
pub(crate) const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const EMBEDDING_ENV_KEYS: [&str; 7] = [
    "CHEMD_EMBEDDING_BASE_URL",
    "CHEMD_EMBEDDING_PATH",
    "CHEMD_EMBEDDING_MODEL",
    "CHEMD_EMBEDDING_DIM",
    "CHEMD_EMBEDDING_DISTANCE_METRIC",
    "CHEMD_EMBEDDING_TIMEOUT_MS",
    "CHEMD_EMBEDDING_API_KEY",
];

#[derive(Debug, Clone)]
pub(crate) struct EmbeddingProviderConfig {
    pub(crate) endpoint: Url,
    pub(crate) model: String,
    pub(crate) embedding_dim: usize,
    pub(crate) timeout_ms: u64,
    pub(crate) api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProviderStatus {
    state: String,
    configured: bool,
    provider_kind: String,
    model: Option<String>,
    embedding_dim: Option<usize>,
    distance_metric: Option<String>,
    base_url_host: Option<String>,
    timeout_ms: Option<u64>,
    api_key_configured: bool,
    detail: String,
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_embedding_provider_status() -> EmbeddingProviderStatus {
    read_embedding_provider_status_impl()
}

pub(crate) fn read_embedding_provider_status_impl() -> EmbeddingProviderStatus {
    let vars = collect_embedding_env();
    read_embedding_provider_status_from_env(&vars)
}

pub(crate) fn read_embedding_provider_status_from_env(
    vars: &BTreeMap<String, String>,
) -> EmbeddingProviderStatus {
    let configured = EMBEDDING_ENV_KEYS
        .iter()
        .any(|key| env_value(vars, key).is_some());
    if !configured {
        return EmbeddingProviderStatus {
            state: "offline".into(),
            configured: false,
            provider_kind: PROVIDER_KIND.into(),
            model: None,
            embedding_dim: None,
            distance_metric: None,
            base_url_host: None,
            timeout_ms: None,
            api_key_configured: false,
            detail: "Set CHEMD_EMBEDDING_BASE_URL, CHEMD_EMBEDDING_MODEL, and CHEMD_EMBEDDING_DIM to enable connected RAG embeddings; no provider request was made".into(),
        };
    }

    let mut issues = Vec::new();
    let base_url_host = read_base_url_host(vars, &mut issues);
    let model = read_model(vars, &mut issues);
    let embedding_dim = read_positive_usize(vars, "CHEMD_EMBEDDING_DIM", None, &mut issues);
    let distance_metric = read_distance_metric(vars, &mut issues);
    let timeout_ms = read_positive_u64(
        vars,
        "CHEMD_EMBEDDING_TIMEOUT_MS",
        Some(DEFAULT_TIMEOUT_MS),
        &mut issues,
    );
    let api_key_configured = env_value(vars, "CHEMD_EMBEDDING_API_KEY").is_some();
    let state = if issues.is_empty() {
        "ready"
    } else if base_url_host.is_none() && model.is_none() && embedding_dim.is_none() {
        "offline"
    } else {
        "degraded"
    };
    let detail = status_detail(state, &issues);

    EmbeddingProviderStatus {
        state: state.into(),
        configured: true,
        provider_kind: PROVIDER_KIND.into(),
        model,
        embedding_dim,
        distance_metric,
        base_url_host,
        timeout_ms,
        api_key_configured,
        detail,
    }
}

pub(crate) fn read_embedding_provider_config_from_env(
    vars: &BTreeMap<String, String>,
) -> Result<EmbeddingProviderConfig, Vec<&'static str>> {
    let mut issues = Vec::new();
    let _base_url_host = read_base_url_host(vars, &mut issues);
    let endpoint = read_endpoint(vars, &mut issues);
    let model = read_model(vars, &mut issues);
    let embedding_dim = read_positive_usize(vars, "CHEMD_EMBEDDING_DIM", None, &mut issues);
    let timeout_ms = read_positive_u64(
        vars,
        "CHEMD_EMBEDDING_TIMEOUT_MS",
        Some(DEFAULT_TIMEOUT_MS),
        &mut issues,
    );
    if !issues.is_empty() {
        return Err(issues);
    }
    Ok(EmbeddingProviderConfig {
        endpoint: endpoint.expect("endpoint exists when there are no issues"),
        model: model.expect("model exists when there are no issues"),
        embedding_dim: embedding_dim.expect("dimension exists when there are no issues"),
        timeout_ms: timeout_ms.expect("timeout exists when there are no issues"),
        api_key: env_value(vars, "CHEMD_EMBEDDING_API_KEY").map(ToString::to_string),
    })
}

pub(crate) fn embedding_env_configured(vars: &BTreeMap<String, String>) -> bool {
    EMBEDDING_ENV_KEYS
        .iter()
        .any(|key| env_value(vars, key).is_some())
}

pub(crate) fn collect_embedding_env() -> BTreeMap<String, String> {
    env::vars()
        .filter(|(key, _)| EMBEDDING_ENV_KEYS.contains(&key.as_str()))
        .collect::<BTreeMap<_, _>>()
}

pub(crate) fn embedding_status_detail(state: &str, issues: &[&str]) -> String {
    status_detail(state, issues)
}

fn env_value<'a>(vars: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
    vars.get(key)
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn read_endpoint(vars: &BTreeMap<String, String>, issues: &mut Vec<&'static str>) -> Option<Url> {
    let value = env_value(vars, "CHEMD_EMBEDDING_BASE_URL")?;
    let Ok(mut url) = Url::parse(value) else {
        return None;
    };
    let Some(path) = env_value(vars, "CHEMD_EMBEDDING_PATH") else {
        return Some(url);
    };
    if Url::parse(path).is_ok() || path.contains('?') || path.contains('#') {
        issues.push("CHEMD_EMBEDDING_PATH must be a URL path without query or fragment");
        return None;
    }
    let endpoint = if path.starts_with('/') {
        url.set_path(path);
        url
    } else {
        match url.join(path) {
            Ok(endpoint) => endpoint,
            Err(_) => {
                issues.push("CHEMD_EMBEDDING_PATH must be a valid URL path");
                return None;
            }
        }
    };
    Some(endpoint)
}

fn read_base_url_host(
    vars: &BTreeMap<String, String>,
    issues: &mut Vec<&'static str>,
) -> Option<String> {
    let Some(value) = env_value(vars, "CHEMD_EMBEDDING_BASE_URL") else {
        issues.push("CHEMD_EMBEDDING_BASE_URL is missing");
        return None;
    };
    let Ok(url) = Url::parse(value) else {
        issues.push("CHEMD_EMBEDDING_BASE_URL must be a valid URL");
        return None;
    };
    if !matches!(url.scheme(), "http" | "https") {
        issues.push("CHEMD_EMBEDDING_BASE_URL must use http or https");
        return None;
    }
    let Some(host) = url.host_str() else {
        issues.push("CHEMD_EMBEDDING_BASE_URL must include a host");
        return None;
    };
    Some(match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    })
}

fn read_model(vars: &BTreeMap<String, String>, issues: &mut Vec<&'static str>) -> Option<String> {
    match env_value(vars, "CHEMD_EMBEDDING_MODEL") {
        Some(value) => Some(value.to_string()),
        None => {
            issues.push("CHEMD_EMBEDDING_MODEL is missing");
            None
        }
    }
}

fn read_positive_usize(
    vars: &BTreeMap<String, String>,
    key: &'static str,
    fallback: Option<usize>,
    issues: &mut Vec<&'static str>,
) -> Option<usize> {
    let Some(value) = env_value(vars, key) else {
        if let Some(fallback) = fallback {
            return Some(fallback);
        }
        issues.push("CHEMD_EMBEDDING_DIM is missing");
        return None;
    };
    match value.parse::<usize>() {
        Ok(parsed) if parsed > 0 => Some(parsed),
        _ => {
            issues.push("CHEMD_EMBEDDING_DIM must be a positive integer");
            None
        }
    }
}

fn read_positive_u64(
    vars: &BTreeMap<String, String>,
    key: &'static str,
    fallback: Option<u64>,
    issues: &mut Vec<&'static str>,
) -> Option<u64> {
    let Some(value) = env_value(vars, key) else {
        return fallback;
    };
    match value.parse::<u64>() {
        Ok(parsed) if parsed > 0 => Some(parsed),
        _ => {
            issues.push("CHEMD_EMBEDDING_TIMEOUT_MS must be a positive integer");
            None
        }
    }
}

fn read_distance_metric(
    vars: &BTreeMap<String, String>,
    issues: &mut Vec<&'static str>,
) -> Option<String> {
    let Some(value) = env_value(vars, "CHEMD_EMBEDDING_DISTANCE_METRIC") else {
        return Some(DEFAULT_DISTANCE_METRIC.into());
    };
    if matches!(value, "cosine" | "l2" | "inner_product") {
        return Some(value.into());
    }
    issues.push("CHEMD_EMBEDDING_DISTANCE_METRIC must be cosine, l2, or inner_product");
    None
}

fn status_detail(state: &str, issues: &[&str]) -> String {
    match state {
        "ready" => {
            "Embedding provider env is configured for connected RAG; no provider request was made"
                .into()
        }
        "offline" => {
            "Embedding provider env is not usable for connected RAG; no provider request was made"
                .into()
        }
        _ => format!(
            "Embedding provider env is incomplete or invalid: {}; no provider request was made",
            issues.join("; ")
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedding_provider_status_reports_offline_when_unconfigured() {
        let status = read_embedding_provider_status_from_env(&BTreeMap::new());

        assert_eq!(status.state, "offline");
        assert!(!status.configured);
        assert_eq!(status.provider_kind, "http_env");
        assert_eq!(status.model, None);
        assert_eq!(status.embedding_dim, None);
        assert_eq!(status.distance_metric, None);
        assert_eq!(status.base_url_host, None);
        assert_eq!(status.timeout_ms, None);
        assert!(!status.api_key_configured);
    }

    #[test]
    fn embedding_provider_status_reports_ready_when_configured() {
        let status = read_embedding_provider_status_from_env(&env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example:8443/v1"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "1536"),
            ("CHEMD_EMBEDDING_DISTANCE_METRIC", "l2"),
            ("CHEMD_EMBEDDING_TIMEOUT_MS", "12000"),
        ]));

        assert_eq!(status.state, "ready");
        assert!(status.configured);
        assert_eq!(status.model.as_deref(), Some("text-embedding-3-small"));
        assert_eq!(status.embedding_dim, Some(1536));
        assert_eq!(status.distance_metric.as_deref(), Some("l2"));
        assert_eq!(status.base_url_host.as_deref(), Some("embed.example:8443"));
        assert_eq!(status.timeout_ms, Some(12_000));
    }

    #[test]
    fn embedding_provider_status_redacts_api_key() {
        let secret = "sk-test-secret-value";
        let status = read_embedding_provider_status_from_env(&env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "1536"),
            ("CHEMD_EMBEDDING_API_KEY", secret),
        ]));
        let serialized = serde_json::to_string(&status).expect("status serializes");

        assert_eq!(status.state, "ready");
        assert!(status.api_key_configured);
        assert!(!serialized.contains(secret));
    }

    #[test]
    fn embedding_provider_status_reports_invalid_dim_metric_and_timeout() {
        let status = read_embedding_provider_status_from_env(&env_map([
            ("CHEMD_EMBEDDING_BASE_URL", "https://embed.example"),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "0"),
            ("CHEMD_EMBEDDING_DISTANCE_METRIC", "dot"),
            ("CHEMD_EMBEDDING_TIMEOUT_MS", "soon"),
        ]));

        assert_eq!(status.state, "degraded");
        assert_eq!(status.embedding_dim, None);
        assert_eq!(status.distance_metric, None);
        assert_eq!(status.timeout_ms, None);
        assert!(status.detail.contains("CHEMD_EMBEDDING_DIM"));
        assert!(status.detail.contains("CHEMD_EMBEDDING_DISTANCE_METRIC"));
        assert!(status.detail.contains("CHEMD_EMBEDDING_TIMEOUT_MS"));
    }

    #[test]
    fn embedding_provider_status_does_not_leak_full_url_query_or_secret() {
        let secret = "secret-query-token";
        let full_url = format!("https://user:password@embed.example/v1?api_key={secret}");
        let status = read_embedding_provider_status_from_env(&env_map([
            ("CHEMD_EMBEDDING_BASE_URL", &full_url),
            ("CHEMD_EMBEDDING_MODEL", "text-embedding-3-small"),
            ("CHEMD_EMBEDDING_DIM", "1536"),
        ]));
        let serialized = serde_json::to_string(&status).expect("status serializes");

        assert_eq!(status.state, "ready");
        assert_eq!(status.base_url_host.as_deref(), Some("embed.example"));
        assert!(!serialized.contains(&full_url));
        assert!(!serialized.contains(secret));
        assert!(!serialized.contains("password"));
        assert!(!serialized.contains("/v1"));
        assert!(!serialized.contains("api_key"));
    }

    fn env_map<const N: usize>(items: [(&str, &str); N]) -> BTreeMap<String, String> {
        items
            .into_iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }
}
