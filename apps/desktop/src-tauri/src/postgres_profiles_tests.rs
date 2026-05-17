use crate::{
    postgres_profiles::{
        activate_postgres_profile_with_store, bind_workspace_postgres_profile_with_store,
        delete_postgres_profile_with_store, list_postgres_profiles_with_store,
        postgres_profile_env_source_for_workspace_with_store,
        postgres_profile_env_source_with_store, save_postgres_profile_with_store,
        BindWorkspacePostgresProfileInput, PostgresProfileSecretStore, SavePostgresProfileInput,
    },
    workspace::CommandError,
};
use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
struct MemorySecretStore {
    values: Mutex<BTreeMap<String, String>>,
}

impl PostgresProfileSecretStore for MemorySecretStore {
    fn write(&self, secret_ref: &str, password: &str) -> Result<(), CommandError> {
        self.values
            .lock()
            .expect("secret store lock should be available")
            .insert(secret_ref.into(), password.into());
        Ok(())
    }

    fn read(&self, secret_ref: &str) -> Result<String, CommandError> {
        self.values
            .lock()
            .expect("secret store lock should be available")
            .get(secret_ref)
            .cloned()
            .ok_or_else(|| {
                CommandError::new(
                    "postgres_profile_secret_storage_failed",
                    "Postgres profile secret storage failed",
                    Some("missing test secret".into()),
                )
            })
    }

    fn delete(&self, secret_ref: &str) -> Result<(), CommandError> {
        self.values
            .lock()
            .expect("secret store lock should be available")
            .remove(secret_ref);
        Ok(())
    }
}

struct TestProfiles {
    root: PathBuf,
    secrets: MemorySecretStore,
}

impl TestProfiles {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("chemd-postgres-profiles-{name}-{suffix}"));
        fs::create_dir_all(&root).expect("test profile root should be created");
        Self {
            root,
            secrets: MemorySecretStore::default(),
        }
    }

    fn profile_file_content(&self) -> String {
        fs::read_to_string(self.root.join("profiles.json")).expect("profiles file should exist")
    }
}

impl Drop for TestProfiles {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn save_profile_stores_secret_outside_profile_file_and_exports_active_env() {
    let profiles = TestProfiles::new("save");
    let state = save_postgres_profile_with_store(
        &profiles.root,
        profile_input("Remote Lab", Some("secret-password"), true),
        &profiles.secrets,
    )
    .expect("profile should save");

    assert_eq!(state.active_profile_id.as_deref(), Some("remote-lab"));
    assert_eq!(state.profiles.len(), 1);
    assert_eq!(state.profiles[0].profile_id, "remote-lab");
    assert_eq!(state.profiles[0].host, "103.24.219.156");
    assert_eq!(state.profiles[0].port, 5632);
    assert!(state.profiles[0].password_saved);

    let file = profiles.profile_file_content();
    assert!(file.contains("\"secretRef\": \"remote-lab\""));
    assert!(!file.contains("secret-password"));

    let source = postgres_profile_env_source_with_store(&profiles.root, &profiles.secrets)
        .expect("active profile should produce env source");
    assert!(source.label.contains("postgres profile:"));
    assert_eq!(
        source.vars.get("CHEMD_POSTGRES_CONNECTION_TIMEOUT_MS"),
        Some(&"7000".into())
    );
    let database_url = source
        .vars
        .get("CHEMD_POSTGRES_DATABASE_URL")
        .expect("database url should be exported");
    assert!(database_url.contains("103.24.219.156:5632/postgres"));
    assert!(database_url.contains("sslmode=require"));
}

#[test]
fn save_profile_requires_password_for_new_profile() {
    let profiles = TestProfiles::new("missing-password");
    let error = save_postgres_profile_with_store(
        &profiles.root,
        profile_input("Remote Lab", None, false),
        &profiles.secrets,
    )
    .expect_err("new profile without password should fail");

    assert_eq!(error.code, "postgres_profile_invalid_input");
    assert!(error
        .message
        .contains("Postgres profile password is required"));
}

#[test]
fn save_profile_rejects_invalid_port() {
    let profiles = TestProfiles::new("invalid-port");
    let error = save_postgres_profile_with_store(
        &profiles.root,
        SavePostgresProfileInput {
            port: 0,
            ..profile_input("Remote Lab", Some("secret-password"), false)
        },
        &profiles.secrets,
    )
    .expect_err("zero port should fail");

    assert_eq!(error.code, "postgres_profile_invalid_input");
    assert!(error.message.contains("port must be greater than 0"));
}

#[test]
fn update_profile_can_keep_existing_password() {
    let profiles = TestProfiles::new("update");
    save_postgres_profile_with_store(
        &profiles.root,
        profile_input("Remote Lab", Some("secret-password"), true),
        &profiles.secrets,
    )
    .expect("initial profile should save");

    let updated = save_postgres_profile_with_store(
        &profiles.root,
        SavePostgresProfileInput {
            profile_id: Some("remote-lab".into()),
            label: "Remote Lab Primary".into(),
            password: None,
            timeout_ms: Some(9000),
            ..profile_input("Remote Lab", None, false)
        },
        &profiles.secrets,
    )
    .expect("existing profile should update without replacing password");

    assert_eq!(updated.profiles.len(), 1);
    assert_eq!(updated.profiles[0].label, "Remote Lab Primary");
    assert_eq!(updated.profiles[0].timeout_ms, 9000);
    assert!(updated.profiles[0].password_saved);
    assert!(!profiles.profile_file_content().contains("secret-password"));
}

#[test]
fn activate_and_delete_profile_updates_state() {
    let profiles = TestProfiles::new("activate-delete");
    save_postgres_profile_with_store(
        &profiles.root,
        profile_input("First", Some("first-password"), true),
        &profiles.secrets,
    )
    .expect("first profile should save");
    save_postgres_profile_with_store(
        &profiles.root,
        profile_input("Second", Some("second-password"), true),
        &profiles.secrets,
    )
    .expect("second profile should save and activate");

    let active = activate_postgres_profile_with_store(&profiles.root, "first", &profiles.secrets)
        .expect("first profile should activate");
    assert_eq!(active.active_profile_id.as_deref(), Some("first"));

    let after_delete =
        delete_postgres_profile_with_store(&profiles.root, "first", &profiles.secrets)
            .expect("active profile should delete");
    assert_eq!(after_delete.active_profile_id.as_deref(), Some("second"));
    assert_eq!(after_delete.profiles.len(), 1);
    assert_eq!(after_delete.profiles[0].profile_id, "second");

    let listed = list_postgres_profiles_with_store(&profiles.root, &profiles.secrets)
        .expect("profiles should list");
    assert_eq!(listed.active_profile_id.as_deref(), Some("second"));
    assert_eq!(listed.profiles.len(), 1);
    assert!(!profiles.profile_file_content().contains("first-password"));
    assert!(!profiles.profile_file_content().contains("second-password"));
}

#[test]
fn workspace_binding_exports_workspace_specific_profile() {
    let profiles = TestProfiles::new("workspace-binding");
    save_postgres_profile_with_store(
        &profiles.root,
        profile_input("First", Some("first-password"), true),
        &profiles.secrets,
    )
    .expect("first profile should save");
    save_postgres_profile_with_store(
        &profiles.root,
        SavePostgresProfileInput {
            database: "workspace_db".into(),
            password: Some("second-password".into()),
            ..profile_input("Second", None, false)
        },
        &profiles.secrets,
    )
    .expect("second profile should save");

    let state = bind_workspace_postgres_profile_with_store(
        &profiles.root,
        BindWorkspacePostgresProfileInput {
            workspace_id: "workspace-alpha".into(),
            profile_id: Some("second".into()),
        },
        &profiles.secrets,
    )
    .expect("workspace should bind");

    assert_eq!(
        state
            .workspace_profile_bindings
            .get("workspace-alpha")
            .map(String::as_str),
        Some("second")
    );
    let source = postgres_profile_env_source_for_workspace_with_store(
        &profiles.root,
        "workspace-alpha",
        &profiles.secrets,
    )
    .expect("workspace binding should export env source");
    assert!(source
        .label
        .contains("workspace postgres binding:workspace-alpha"));
    assert!(source
        .vars
        .get("CHEMD_POSTGRES_DATABASE_URL")
        .expect("database url should be present")
        .contains("workspace_db"));
}

fn profile_input(
    label: &str,
    password: Option<&str>,
    set_active: bool,
) -> SavePostgresProfileInput {
    SavePostgresProfileInput {
        profile_id: None,
        label: label.into(),
        host: "103.24.219.156".into(),
        port: 5632,
        database: "postgres".into(),
        user: "postgres".into(),
        password: password.map(str::to_string),
        sslmode: Some("require".into()),
        timeout_ms: Some(7000),
        pool: Some("4".into()),
        set_active: Some(set_active),
    }
}
