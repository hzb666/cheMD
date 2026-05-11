use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceHandle {
    workspace_id: String,
    display_name: String,
    root_hint: String,
    writable: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceFileEntry {
    id: String,
    name: String,
    path: String,
    kind: String,
    chemd_kind: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarStatus {
    state: String,
    label: String,
    detail: String,
    pid: Option<u32>,
}

#[tauri::command]
fn open_workspace() -> WorkspaceHandle {
    WorkspaceHandle {
        workspace_id: "placeholder-workspace".into(),
        display_name: "No workspace selected".into(),
        root_hint: "Workspace picker is intentionally deferred".into(),
        writable: false,
    }
}

#[tauri::command]
fn list_workspace_files(workspace_id: String) -> Vec<WorkspaceFileEntry> {
    vec![
        WorkspaceFileEntry {
            id: format!("{workspace_id}:experiments"),
            name: "experiments".into(),
            path: "/workspace/experiments".into(),
            kind: "directory".into(),
            chemd_kind: None,
        },
        WorkspaceFileEntry {
            id: format!("{workspace_id}:suzuki-screen"),
            name: "suzuki-screen.chemd.md".into(),
            path: "/workspace/experiments/suzuki-screen.chemd.md".into(),
            kind: "file".into(),
            chemd_kind: Some("document".into()),
        },
    ]
}

#[tauri::command]
fn read_sidecar_status() -> SidecarStatus {
    SidecarStatus {
        state: "placeholder".into(),
        label: "Sidecar idle".into(),
        detail: "chem-service process manager is not connected in this slice".into(),
        pid: None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_workspace_files,
            read_sidecar_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running Chemd Desktop IDE");
}
