mod workspace;
mod workspace_file_io;
mod workspace_io;
mod workspace_path;

#[cfg(test)]
mod workspace_tests;

#[cfg(not(test))]
use serde::Serialize;
#[cfg(not(test))]
use workspace::{
    list_workspace_files, open_workspace, read_workspace_file, write_workspace_file,
    DesktopCommandError, WorkspaceRegistry,
};

#[cfg(not(test))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarStatus {
    state: String,
    label: String,
    detail: String,
    pid: Option<u32>,
}

#[cfg(not(test))]
#[tauri::command]
fn read_sidecar_status() -> Result<SidecarStatus, DesktopCommandError> {
    Ok(SidecarStatus {
        state: "placeholder".into(),
        label: "Sidecar idle".into(),
        detail: "chem-service process manager is not connected in this slice".into(),
        pid: None,
    })
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WorkspaceRegistry::default())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_workspace_files,
            read_workspace_file,
            write_workspace_file,
            read_sidecar_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chemd Desktop IDE");
}
