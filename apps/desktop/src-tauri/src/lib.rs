mod postgres;
mod postgres_config;
mod sidecar;
mod sidecar_command;
mod sidecar_log;
mod workspace;
mod workspace_file_io;
mod workspace_io;
mod workspace_path;

#[cfg(test)]
mod postgres_tests;
#[cfg(test)]
mod sidecar_tests;
#[cfg(test)]
mod workspace_tests;

#[cfg(not(test))]
use postgres::read_postgres_status;
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
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_workspace_files,
            read_workspace_file,
            write_workspace_file,
            start_sidecar,
            stop_sidecar,
            read_sidecar_status,
            read_sidecar_logs,
            read_postgres_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chemd Desktop IDE");
}
