mod diagnostics_bundle;
mod local_store;
mod local_store_io;
mod local_store_status;
mod local_store_sync;
mod local_store_time;
mod local_store_types;
mod managed_postgres;
mod managed_postgres_config;
mod managed_postgres_migrations;
mod managed_postgres_process;
mod postgres;
mod postgres_config;
mod postgres_profiles;
mod postgres_rag;
mod postgres_runtime_core;
mod postgres_runtime_graph_cleanup;
mod postgres_runtime_persist;
mod postgres_runtime_sql;
mod postgres_runtime_types;
mod reaction_intelligence_worker;
mod sidecar;
mod sidecar_command;
mod sidecar_log;
mod workspace;
mod workspace_file_io;
mod workspace_io;
mod workspace_path;

#[cfg(test)]
mod diagnostics_bundle_tests;
#[cfg(test)]
mod local_store_sync_tests;
#[cfg(test)]
mod local_store_tests;
#[cfg(test)]
mod postgres_profiles_tests;
#[cfg(test)]
mod postgres_rag_tests;
#[cfg(test)]
mod postgres_tests;
#[cfg(test)]
mod reaction_intelligence_worker_tests;
#[cfg(test)]
mod sidecar_tests;
#[cfg(test)]
mod workspace_tests;

#[cfg(not(test))]
use diagnostics_bundle::export_diagnostics_bundle;
#[cfg(not(test))]
use local_store::{
    clear_local_outbox_failures, list_local_outbox, list_local_reaction_intelligence_artifacts,
    mark_local_outbox_synced, read_local_store_status, save_local_reaction_intelligence_artifact,
    save_local_runtime_snapshot,
};
#[cfg(not(test))]
use local_store_sync::sync_local_outbox_to_postgres;
#[cfg(not(test))]
use managed_postgres::{
    initialize_managed_postgres, migrate_managed_postgres, read_managed_postgres_status,
    start_managed_postgres, stop_managed_postgres, ManagedPostgresManager,
};
#[cfg(not(test))]
use postgres::read_postgres_status;
#[cfg(not(test))]
use postgres_profiles::{
    activate_postgres_profile, delete_postgres_profile, list_postgres_profiles,
    save_postgres_profile,
};
#[cfg(not(test))]
use postgres_rag::query_postgres_rag;
#[cfg(not(test))]
use postgres_runtime_persist::persist_runtime_graph_rag;
#[cfg(not(test))]
use reaction_intelligence_worker::run_reaction_intelligence_worker;
#[cfg(not(test))]
use sidecar::{
    read_sidecar_logs, read_sidecar_status, start_sidecar, stop_sidecar, SidecarManager,
};
#[cfg(not(test))]
use workspace::{
    list_workspace_files, open_workspace, read_workspace_file, write_workspace_file,
    WorkspaceRegistry,
};

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceRegistry::default())
        .manage(SidecarManager::default())
        .manage(ManagedPostgresManager::default())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_workspace_files,
            read_workspace_file,
            write_workspace_file,
            start_sidecar,
            stop_sidecar,
            read_sidecar_status,
            read_sidecar_logs,
            read_postgres_status,
            list_postgres_profiles,
            save_postgres_profile,
            activate_postgres_profile,
            delete_postgres_profile,
            read_managed_postgres_status,
            initialize_managed_postgres,
            start_managed_postgres,
            stop_managed_postgres,
            migrate_managed_postgres,
            read_local_store_status,
            save_local_runtime_snapshot,
            save_local_reaction_intelligence_artifact,
            list_local_reaction_intelligence_artifacts,
            list_local_outbox,
            mark_local_outbox_synced,
            clear_local_outbox_failures,
            sync_local_outbox_to_postgres,
            persist_runtime_graph_rag,
            query_postgres_rag,
            run_reaction_intelligence_worker,
            export_diagnostics_bundle
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chemd Desktop IDE");
}
