#![cfg_attr(test, allow(dead_code))]

use crate::managed_postgres_config::{
    managed_config_candidate_roots, managed_env_source, ManagedPostgresPaths,
};
use std::{collections::BTreeMap, env, fs, path::Path};
use url::Url;

const DATABASE_URL_KEYS: [&str; 2] = ["CHEMD_POSTGRES_DATABASE_URL", "DATABASE_URL"];
const SSL_KEYS: [&str; 3] = ["CHEMD_POSTGRES_SSL", "CHEMD_POSTGRES_SSLMODE", "PGSSLMODE"];
const TIMEOUT_MS_KEYS: [&str; 3] = [
    "CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS",
    "CHEMD_POSTGRES_CONNECT_TIMEOUT_MS",
    "CHEMD_POSTGRES_TIMEOUT_MS",
];
const TIMEOUT_SECONDS_KEYS: [&str; 1] = ["PGCONNECT_TIMEOUT"];
const POOL_KEYS: [&str; 3] = [
    "CHEMD_POSTGRES_POOL",
    "CHEMD_POSTGRES_POOL_SIZE",
    "CHEMD_POSTGRES_POOL_MAX",
];
const DEFAULT_TIMEOUT_MS: u64 = 5_000;

#[derive(Debug, Clone)]
pub(crate) struct EnvSource {
    pub(crate) label: String,
    pub(crate) vars: BTreeMap<String, String>,
}

#[derive(Debug, Clone)]
pub(crate) struct PostgresRuntimeConfig {
    pub(crate) database_url: String,
    pub(crate) source: String,
    pub(crate) host: Option<String>,
    pub(crate) database: Option<String>,
    pub(crate) user: Option<String>,
    pub(crate) password: Option<String>,
    pub(crate) ssl: String,
    pub(crate) timeout_ms: u64,
    pub(crate) pool: Option<String>,
}

pub(crate) fn load_postgres_config() -> Option<PostgresRuntimeConfig> {
    let repo_root = env::current_dir()
        .ok()
        .and_then(|current_dir| find_repo_root(&current_dir));
    load_postgres_config_from_repo(repo_root.as_deref())
}

pub(crate) fn load_postgres_config_from_repo(
    repo_root: Option<&Path>,
) -> Option<PostgresRuntimeConfig> {
    select_postgres_config(config_sources(repo_root))
}

#[cfg(test)]
pub(crate) fn load_postgres_config_from_managed_root(
    repo_root: Option<&Path>,
    managed_root: Option<&Path>,
) -> Option<PostgresRuntimeConfig> {
    let mut sources = config_sources(repo_root);
    if let Some(root) = managed_root {
        if let Some(source) = managed_env_source(&ManagedPostgresPaths::for_root(root)) {
            sources.push(source);
        }
    }
    select_postgres_config(sources)
}

pub(crate) fn select_postgres_config(sources: Vec<EnvSource>) -> Option<PostgresRuntimeConfig> {
    let selected = select_database_url(&sources)?;
    let parsed_url = Url::parse(&selected.database_url).ok();
    let ssl = ssl_summary(parsed_url.as_ref(), lookup_first(&sources, &SSL_KEYS));
    let timeout_ms = timeout_ms(parsed_url.as_ref(), &sources);
    let pool = lookup_first(&sources, &POOL_KEYS).map(|(_, value)| value);
    let (host, database, user, password) = postgres_url_parts(parsed_url.as_ref());

    Some(PostgresRuntimeConfig {
        database_url: selected.database_url,
        source: selected.source,
        host,
        database,
        user,
        password,
        ssl,
        timeout_ms,
        pool,
    })
}

pub(crate) fn parse_env_file(content: &str) -> BTreeMap<String, String> {
    let mut vars = BTreeMap::new();
    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        if key.is_empty() {
            continue;
        }
        vars.insert(key.into(), unquote_env_value(value.trim()));
    }
    vars
}

pub(crate) fn redact_postgres_url(database_url: &str) -> String {
    let Ok(mut url) = Url::parse(database_url) else {
        return "<invalid-postgres-url>".into();
    };
    if url.password().is_some() {
        let _ = url.set_password(Some("<redacted>"));
    }
    url.to_string()
}

pub(crate) fn redact_config_detail(detail: &str, config: &PostgresRuntimeConfig) -> String {
    let mut redacted = detail.replace(
        &config.database_url,
        &redact_postgres_url(&config.database_url),
    );
    if let Some(password) = &config.password {
        if !password.is_empty() {
            redacted = redacted.replace(password, "<redacted>");
        }
    }
    redacted
}

fn config_sources(repo_root: Option<&Path>) -> Vec<EnvSource> {
    let mut sources = vec![process_source()];
    if let Some(repo_root) = repo_root {
        sources.extend(
            [
                repo_root.join(".env.local"),
                repo_root.join(".env"),
                repo_root.join("apps").join("web").join(".env.local"),
                repo_root.join("apps").join("web").join(".env"),
            ]
            .into_iter()
            .filter_map(|path| file_source(repo_root, &path)),
        );
    }
    sources.extend(
        managed_config_candidate_roots()
            .into_iter()
            .filter_map(|root| managed_env_source(&ManagedPostgresPaths::for_root(&root))),
    );
    sources
}

fn process_source() -> EnvSource {
    EnvSource {
        label: "process env".into(),
        vars: env::vars().collect(),
    }
}

fn file_source(repo_root: &Path, path: &Path) -> Option<EnvSource> {
    let content = fs::read_to_string(path).ok()?;
    Some(EnvSource {
        label: relative_label(repo_root, path),
        vars: parse_env_file(&content),
    })
}

fn relative_label(repo_root: &Path, path: &Path) -> String {
    path.strip_prefix(repo_root)
        .unwrap_or(path)
        .display()
        .to_string()
}

fn find_repo_root(start: &Path) -> Option<std::path::PathBuf> {
    start
        .ancestors()
        .find(|path| path.join("pnpm-workspace.yaml").exists())
        .map(Path::to_path_buf)
}

struct SelectedDatabaseUrl {
    database_url: String,
    source: String,
}

fn select_database_url(sources: &[EnvSource]) -> Option<SelectedDatabaseUrl> {
    for source in sources {
        for key in DATABASE_URL_KEYS {
            let Some(value) = source.vars.get(key) else {
                continue;
            };
            if value.trim().is_empty() {
                continue;
            }
            return Some(SelectedDatabaseUrl {
                database_url: value.trim().into(),
                source: format!("{}:{key}", source.label),
            });
        }
    }
    None
}

fn lookup_first(sources: &[EnvSource], keys: &[&str]) -> Option<(String, String)> {
    for source in sources {
        for key in keys {
            let Some(value) = source.vars.get(*key) else {
                continue;
            };
            if value.trim().is_empty() {
                continue;
            }
            return Some((format!("{}:{key}", source.label), value.trim().into()));
        }
    }
    None
}

fn postgres_url_parts(
    parsed_url: Option<&Url>,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Some(url) = parsed_url else {
        return (None, None, None, None);
    };
    let host = url.host_str().map(str::to_string);
    let database = url
        .path_segments()
        .and_then(|mut segments| segments.next())
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let user = if url.username().is_empty() {
        None
    } else {
        Some(url.username().to_string())
    };
    let password = url.password().map(str::to_string);
    (host, database, user, password)
}

fn ssl_summary(parsed_url: Option<&Url>, env_ssl: Option<(String, String)>) -> String {
    if let Some(mode) = parsed_url.and_then(|url| query_value(url, "sslmode")) {
        return format!("sslmode={mode}");
    }
    env_ssl
        .map(|(_, value)| value)
        .unwrap_or_else(|| "default".into())
}

fn timeout_ms(parsed_url: Option<&Url>, sources: &[EnvSource]) -> u64 {
    if let Some((_, value)) = lookup_first(sources, &TIMEOUT_MS_KEYS) {
        if let Ok(timeout) = value.parse::<u64>() {
            return timeout.max(1);
        }
    }
    if let Some((_, value)) = lookup_first(sources, &TIMEOUT_SECONDS_KEYS) {
        if let Ok(timeout) = value.parse::<u64>() {
            return timeout.saturating_mul(1_000).max(1);
        }
    }
    if let Some(seconds) = parsed_url.and_then(|url| query_value(url, "connect_timeout")) {
        if let Ok(timeout) = seconds.parse::<u64>() {
            return timeout.saturating_mul(1_000).max(1);
        }
    }
    DEFAULT_TIMEOUT_MS
}

fn query_value(url: &Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(name, _)| name == key)
        .map(|(_, value)| value.into_owned())
}

fn unquote_env_value(value: &str) -> String {
    let without_comment = strip_inline_comment(value).trim();
    if without_comment.len() >= 2 {
        let bytes = without_comment.as_bytes();
        let quoted = (bytes[0] == b'"' && bytes[without_comment.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[without_comment.len() - 1] == b'\'');
        if quoted {
            return without_comment[1..without_comment.len() - 1].to_string();
        }
    }
    without_comment.to_string()
}

fn strip_inline_comment(value: &str) -> &str {
    let mut previous = '\0';
    let mut quote = None;
    for (index, ch) in value.char_indices() {
        match ch {
            '"' | '\'' if previous != '\\' => {
                quote = if quote == Some(ch) {
                    None
                } else if quote.is_none() {
                    Some(ch)
                } else {
                    quote
                };
            }
            '#' if quote.is_none() => return &value[..index],
            _ => {}
        }
        previous = ch;
    }
    value
}
