#![cfg_attr(test, allow(dead_code))]

use crate::{
    local_store_time::unix_timestamp_ms,
    postgres_config::{normalize_postgres_database_url, EnvSource},
    workspace::CommandError,
};
use keyring_core::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
};

const POSTGRES_PROFILES_DIR: &str = "postgres-profiles";
const POSTGRES_PROFILES_FILE: &str = "profiles.json";
const KEYRING_SERVICE: &str = "dev.chemd.desktop.postgres";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresProfilesFile {
    pub(crate) active_profile_id: Option<String>,
    #[serde(default)]
    pub(crate) workspace_profile_bindings: BTreeMap<String, String>,
    pub(crate) profiles: Vec<PostgresProfileRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresProfileRecord {
    pub(crate) profile_id: String,
    pub(crate) label: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) user: String,
    pub(crate) sslmode: String,
    pub(crate) timeout_ms: u64,
    pub(crate) pool: Option<String>,
    pub(crate) secret_ref: String,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavePostgresProfileInput {
    pub(crate) profile_id: Option<String>,
    pub(crate) label: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) user: String,
    pub(crate) password: Option<String>,
    pub(crate) sslmode: Option<String>,
    pub(crate) timeout_ms: Option<u64>,
    pub(crate) pool: Option<String>,
    pub(crate) set_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresProfileSummary {
    pub(crate) profile_id: String,
    pub(crate) label: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) database: String,
    pub(crate) user: String,
    pub(crate) sslmode: String,
    pub(crate) timeout_ms: u64,
    pub(crate) pool: Option<String>,
    pub(crate) password_saved: bool,
    pub(crate) active: bool,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PostgresProfilesState {
    pub(crate) active_profile_id: Option<String>,
    pub(crate) workspace_profile_bindings: BTreeMap<String, String>,
    pub(crate) profiles: Vec<PostgresProfileSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BindWorkspacePostgresProfileInput {
    pub(crate) workspace_id: String,
    pub(crate) profile_id: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_postgres_profiles(
    app: tauri::AppHandle,
) -> Result<PostgresProfilesState, CommandError> {
    list_postgres_profiles_impl(&profile_root(command_root(&app)?))
}

#[cfg(not(test))]
#[tauri::command]
pub fn save_postgres_profile(
    app: tauri::AppHandle,
    input: SavePostgresProfileInput,
) -> Result<PostgresProfilesState, CommandError> {
    save_postgres_profile_impl(&profile_root(command_root(&app)?), input)
}

#[cfg(not(test))]
#[tauri::command]
pub fn activate_postgres_profile(
    app: tauri::AppHandle,
    profile_id: String,
) -> Result<PostgresProfilesState, CommandError> {
    activate_postgres_profile_impl(&profile_root(command_root(&app)?), &profile_id)
}

#[cfg(not(test))]
#[tauri::command]
pub fn delete_postgres_profile(
    app: tauri::AppHandle,
    profile_id: String,
) -> Result<PostgresProfilesState, CommandError> {
    delete_postgres_profile_impl(&profile_root(command_root(&app)?), &profile_id)
}

#[cfg(not(test))]
#[tauri::command]
pub fn bind_workspace_postgres_profile(
    app: tauri::AppHandle,
    input: BindWorkspacePostgresProfileInput,
) -> Result<PostgresProfilesState, CommandError> {
    bind_workspace_postgres_profile_impl(&profile_root(command_root(&app)?), input)
}

pub(crate) fn profile_root(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join(POSTGRES_PROFILES_DIR)
}

pub(crate) fn postgres_profile_candidate_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(home) = env::var("CHEMD_POSTGRES_PROFILE_HOME") {
        roots.push(PathBuf::from(home));
    }
    if let Ok(app_data) = env::var("APPDATA") {
        roots.push(
            Path::new(&app_data)
                .join("dev.chemd.desktop")
                .join(POSTGRES_PROFILES_DIR),
        );
        roots.push(
            Path::new(&app_data)
                .join("Chemd Desktop IDE")
                .join(POSTGRES_PROFILES_DIR),
        );
    }
    if let Ok(xdg) = env::var("XDG_DATA_HOME") {
        roots.push(
            Path::new(&xdg)
                .join("dev.chemd.desktop")
                .join(POSTGRES_PROFILES_DIR),
        );
    }
    roots
}

pub(crate) trait PostgresProfileSecretStore {
    fn write(&self, secret_ref: &str, password: &str) -> Result<(), CommandError>;
    fn read(&self, secret_ref: &str) -> Result<String, CommandError>;
    fn delete(&self, secret_ref: &str) -> Result<(), CommandError>;
}

struct KeyringPostgresProfileSecretStore;

impl PostgresProfileSecretStore for KeyringPostgresProfileSecretStore {
    fn write(&self, secret_ref: &str, password: &str) -> Result<(), CommandError> {
        Entry::new(KEYRING_SERVICE, secret_ref)
            .and_then(|entry| entry.set_password(password))
            .map_err(keyring_error)
    }

    fn read(&self, secret_ref: &str) -> Result<String, CommandError> {
        Entry::new(KEYRING_SERVICE, secret_ref)
            .and_then(|entry| entry.get_password())
            .map_err(keyring_error)
    }

    fn delete(&self, secret_ref: &str) -> Result<(), CommandError> {
        Entry::new(KEYRING_SERVICE, secret_ref)
            .and_then(|entry| entry.delete_credential())
            .map_err(keyring_error)
    }
}

pub(crate) fn postgres_profile_env_source(root: &Path) -> Option<EnvSource> {
    postgres_profile_env_source_with_store(root, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn postgres_profile_env_source_with_store(
    root: &Path,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Option<EnvSource> {
    let file = read_profiles_file(root).ok()?;
    let active_id = file.active_profile_id.as_deref()?;
    env_source_for_profile(root, &file, active_id, secret_store, None)
}

pub(crate) fn postgres_profile_env_source_for_workspace(
    root: &Path,
    workspace_id: &str,
) -> Option<EnvSource> {
    postgres_profile_env_source_for_workspace_with_store(
        root,
        workspace_id,
        &KeyringPostgresProfileSecretStore,
    )
}

pub(crate) fn postgres_profile_env_source_for_workspace_with_store(
    root: &Path,
    workspace_id: &str,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Option<EnvSource> {
    let file = read_profiles_file(root).ok()?;
    let normalized_workspace_id = normalize_workspace_id(workspace_id);
    let profile_id = file
        .workspace_profile_bindings
        .get(&normalized_workspace_id)?;
    env_source_for_profile(
        root,
        &file,
        profile_id,
        secret_store,
        Some(&normalized_workspace_id),
    )
}

pub(crate) fn list_postgres_profiles_impl(
    root: &Path,
) -> Result<PostgresProfilesState, CommandError> {
    list_postgres_profiles_with_store(root, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn list_postgres_profiles_with_store(
    root: &Path,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Result<PostgresProfilesState, CommandError> {
    Ok(to_state(read_profiles_file(root)?, secret_store))
}

pub(crate) fn save_postgres_profile_impl(
    root: &Path,
    input: SavePostgresProfileInput,
) -> Result<PostgresProfilesState, CommandError> {
    save_postgres_profile_with_store(root, input, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn save_postgres_profile_with_store(
    root: &Path,
    input: SavePostgresProfileInput,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Result<PostgresProfilesState, CommandError> {
    let mut file = read_profiles_file(root)?;
    let now = unix_timestamp_ms();
    let profile_id = input
        .profile_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(normalize_profile_id)
        .unwrap_or_else(|| normalize_profile_id(&input.label));
    let existing_created_at = file
        .profiles
        .iter()
        .find(|profile| profile.profile_id == profile_id)
        .map(|profile| profile.created_at.clone());
    let is_new_profile = existing_created_at.is_none();
    let (record, password, set_active) =
        build_record(input, &profile_id, existing_created_at, &now)?;
    if let Some(password) = password {
        secret_store.write(&record.secret_ref, &password)?;
    } else if is_new_profile {
        return Err(invalid_input(
            "Postgres profile password is required for new profiles",
        ));
    }
    upsert_record(&mut file, record);
    if file.active_profile_id.is_none() || file.profiles.len() == 1 {
        file.active_profile_id = Some(profile_id.clone());
    }
    if set_active {
        file.active_profile_id = Some(profile_id);
    }
    write_profiles_file(root, &file)?;
    Ok(to_state(file, secret_store))
}

pub(crate) fn activate_postgres_profile_impl(
    root: &Path,
    profile_id: &str,
) -> Result<PostgresProfilesState, CommandError> {
    activate_postgres_profile_with_store(root, profile_id, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn activate_postgres_profile_with_store(
    root: &Path,
    profile_id: &str,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Result<PostgresProfilesState, CommandError> {
    let mut file = read_profiles_file(root)?;
    let id = normalize_profile_id(profile_id);
    if !file.profiles.iter().any(|profile| profile.profile_id == id) {
        return Err(invalid_input("Postgres profile was not found"));
    }
    file.active_profile_id = Some(id);
    write_profiles_file(root, &file)?;
    Ok(to_state(file, secret_store))
}

pub(crate) fn delete_postgres_profile_impl(
    root: &Path,
    profile_id: &str,
) -> Result<PostgresProfilesState, CommandError> {
    delete_postgres_profile_with_store(root, profile_id, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn delete_postgres_profile_with_store(
    root: &Path,
    profile_id: &str,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Result<PostgresProfilesState, CommandError> {
    let mut file = read_profiles_file(root)?;
    let id = normalize_profile_id(profile_id);
    let before = file.profiles.len();
    if let Some(profile) = file
        .profiles
        .iter()
        .find(|profile| profile.profile_id == id)
    {
        let _ = secret_store.delete(&profile.secret_ref);
    }
    file.profiles.retain(|profile| profile.profile_id != id);
    if file.profiles.len() == before {
        return Err(invalid_input("Postgres profile was not found"));
    }
    file.workspace_profile_bindings
        .retain(|_, bound_profile_id| bound_profile_id != &id);
    if file.active_profile_id.as_deref() == Some(&id) {
        file.active_profile_id = file
            .profiles
            .first()
            .map(|profile| profile.profile_id.clone());
    }
    write_profiles_file(root, &file)?;
    Ok(to_state(file, secret_store))
}

pub(crate) fn bind_workspace_postgres_profile_impl(
    root: &Path,
    input: BindWorkspacePostgresProfileInput,
) -> Result<PostgresProfilesState, CommandError> {
    bind_workspace_postgres_profile_with_store(root, input, &KeyringPostgresProfileSecretStore)
}

pub(crate) fn bind_workspace_postgres_profile_with_store(
    root: &Path,
    input: BindWorkspacePostgresProfileInput,
    secret_store: &dyn PostgresProfileSecretStore,
) -> Result<PostgresProfilesState, CommandError> {
    let mut file = read_profiles_file(root)?;
    let workspace_id = normalize_workspace_id(&input.workspace_id);
    if workspace_id.is_empty() {
        return Err(invalid_input("workspaceId is required"));
    }
    match input.profile_id.as_deref().map(normalize_profile_id) {
        Some(profile_id) if !profile_id.is_empty() => {
            if !file
                .profiles
                .iter()
                .any(|profile| profile.profile_id == profile_id)
            {
                return Err(invalid_input("Postgres profile was not found"));
            }
            file.workspace_profile_bindings
                .insert(workspace_id, profile_id);
        }
        _ => {
            file.workspace_profile_bindings.remove(&workspace_id);
        }
    }
    write_profiles_file(root, &file)?;
    Ok(to_state(file, secret_store))
}

fn read_profiles_file(root: &Path) -> Result<PostgresProfilesFile, CommandError> {
    let path = root.join(POSTGRES_PROFILES_FILE);
    if !path.exists() {
        return Ok(PostgresProfilesFile::default());
    }
    let content = fs::read_to_string(&path).map_err(|error| {
        CommandError::io(
            "postgres_profile_read_failed",
            "Failed to read Postgres profiles",
            error,
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        CommandError::new(
            "postgres_profile_parse_failed",
            "Failed to parse Postgres profiles",
            Some(error.to_string()),
        )
    })
}

fn write_profiles_file(root: &Path, file: &PostgresProfilesFile) -> Result<(), CommandError> {
    fs::create_dir_all(root).map_err(|error| {
        CommandError::io(
            "postgres_profile_dir_failed",
            "Failed to create Postgres profile directory",
            error,
        )
    })?;
    let content = serde_json::to_string_pretty(file).map_err(|error| {
        CommandError::new(
            "postgres_profile_serialize_failed",
            "Failed to serialize Postgres profiles",
            Some(error.to_string()),
        )
    })?;
    fs::write(root.join(POSTGRES_PROFILES_FILE), content).map_err(|error| {
        CommandError::io(
            "postgres_profile_write_failed",
            "Failed to write Postgres profiles",
            error,
        )
    })
}

fn build_record(
    input: SavePostgresProfileInput,
    profile_id: &str,
    existing_created_at: Option<String>,
    now: &str,
) -> Result<(PostgresProfileRecord, Option<String>, bool), CommandError> {
    let host = required(input.host, "host")?;
    let database = required(input.database, "database")?;
    let user = required(input.user, "user")?;
    let label = required(input.label, "label")?;
    let port = required_port(input.port)?;
    let password = input.password.filter(|value| !value.trim().is_empty());
    let set_active = input.set_active.unwrap_or(false);
    let sslmode = input
        .sslmode
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "require".into());
    Ok((
        PostgresProfileRecord {
            profile_id: profile_id.into(),
            label,
            host,
            port,
            database,
            user,
            sslmode,
            timeout_ms: input.timeout_ms.unwrap_or(5_000).max(1),
            pool: input.pool.filter(|value| !value.trim().is_empty()),
            secret_ref: profile_id.into(),
            created_at: existing_created_at.unwrap_or_else(|| now.into()),
            updated_at: now.into(),
        },
        password,
        set_active,
    ))
}

fn upsert_record(file: &mut PostgresProfilesFile, record: PostgresProfileRecord) {
    if let Some(existing) = file
        .profiles
        .iter_mut()
        .find(|profile| profile.profile_id == record.profile_id)
    {
        *existing = record;
        return;
    }
    file.profiles.push(record);
}

fn to_state(
    file: PostgresProfilesFile,
    secret_store: &dyn PostgresProfileSecretStore,
) -> PostgresProfilesState {
    let active = file.active_profile_id.clone();
    PostgresProfilesState {
        active_profile_id: active.clone(),
        workspace_profile_bindings: file.workspace_profile_bindings,
        profiles: file
            .profiles
            .into_iter()
            .map(|profile| PostgresProfileSummary {
                password_saved: profile_password_saved(&profile, secret_store),
                active: active.as_deref() == Some(&profile.profile_id),
                profile_id: profile.profile_id,
                label: profile.label,
                host: profile.host,
                port: profile.port,
                database: profile.database,
                user: profile.user,
                sslmode: profile.sslmode,
                timeout_ms: profile.timeout_ms,
                pool: profile.pool,
                created_at: profile.created_at,
                updated_at: profile.updated_at,
            })
            .collect(),
    }
}

fn profile_password_saved(
    profile: &PostgresProfileRecord,
    secret_store: &dyn PostgresProfileSecretStore,
) -> bool {
    secret_store.read(&profile.secret_ref).is_ok()
}

fn env_source_for_profile(
    root: &Path,
    file: &PostgresProfilesFile,
    profile_id: &str,
    secret_store: &dyn PostgresProfileSecretStore,
    workspace_id: Option<&str>,
) -> Option<EnvSource> {
    let profile = file
        .profiles
        .iter()
        .find(|item| item.profile_id == profile_id)?;
    let password = secret_store.read(&profile.secret_ref).ok()?;
    let mut vars = BTreeMap::new();
    vars.insert(
        "CHEMD_POSTGRES_DATABASE_URL".into(),
        profile_database_url(profile, &password),
    );
    vars.insert(
        "CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS".into(),
        profile.timeout_ms.to_string(),
    );
    if let Some(pool) = &profile.pool {
        vars.insert("CHEMD_POSTGRES_POOL".into(), pool.clone());
    }
    let label = match workspace_id {
        Some(id) => format!(
            "workspace postgres binding:{id}:{}",
            root.join(POSTGRES_PROFILES_FILE).display()
        ),
        None => format!(
            "postgres profile:{}",
            root.join(POSTGRES_PROFILES_FILE).display()
        ),
    };
    Some(EnvSource { label, vars })
}

fn profile_database_url(profile: &PostgresProfileRecord, password: &str) -> String {
    let encoded_user = encode_url_part(&profile.user);
    let encoded_password = encode_url_part(password);
    let encoded_database = encode_url_part(&profile.database);
    normalize_postgres_database_url(&format!(
        "postgresql://{encoded_user}:{encoded_password}@{}:{}/{encoded_database}?sslmode={}",
        profile.host, profile.port, profile.sslmode
    ))
}

fn keyring_error(error: KeyringError) -> CommandError {
    CommandError::new(
        "postgres_profile_secret_storage_failed",
        "Postgres profile secret storage failed",
        Some(error.to_string()),
    )
}

fn required(value: String, field: &str) -> Result<String, CommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(invalid_input(&format!(
            "Postgres profile {field} is required"
        )));
    }
    Ok(trimmed.into())
}

fn required_port(port: u16) -> Result<u16, CommandError> {
    if port == 0 {
        return Err(invalid_input(
            "Postgres profile port must be greater than 0",
        ));
    }
    Ok(port)
}

fn invalid_input(message: &str) -> CommandError {
    CommandError::new("postgres_profile_invalid_input", message, None)
}

fn normalize_profile_id(value: &str) -> String {
    let normalized = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    if normalized.is_empty() {
        "profile".into()
    } else {
        normalized
    }
}

fn normalize_workspace_id(value: &str) -> String {
    value.trim().to_string()
}

fn encode_url_part(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

#[cfg(not(test))]
fn command_root(app: &tauri::AppHandle) -> Result<PathBuf, CommandError> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|err| {
        CommandError::new(
            "postgres_profile_app_data_unavailable",
            "Failed to resolve app data directory for Postgres profiles",
            Some(err.to_string()),
        )
    })
}
