use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, sync::Mutex};

#[cfg(not(test))]
use tauri_plugin_dialog::DialogExt;

#[cfg(not(test))]
use crate::{
    workspace_file_io::{read_workspace_file_impl, write_workspace_file_impl},
    workspace_io::{canonical_workspace_root, list_workspace_files_impl, workspace_handle},
};

#[derive(Default)]
#[cfg_attr(test, allow(dead_code))]
pub struct WorkspaceRegistry {
    roots: Mutex<HashMap<String, PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) detail: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHandle {
    pub(crate) workspace_id: String,
    pub(crate) display_name: String,
    pub(crate) root_path: String,
    pub(crate) root_hint: String,
    pub(crate) writable: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: String,
    pub(crate) chemd_kind: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFileContent {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) bytes: usize,
    pub(crate) content_hash: String,
    pub(crate) modified_at_ms: Option<u64>,
    pub(crate) chemd_kind: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWriteResult {
    pub(crate) path: String,
    pub(crate) bytes: usize,
    pub(crate) content_hash: String,
    pub(crate) modified_at_ms: Option<u64>,
    pub(crate) chemd_kind: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub fn open_workspace(
    app: tauri::AppHandle,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<Option<WorkspaceHandle>, CommandError> {
    let Some(selected_path) = app
        .dialog()
        .file()
        .set_title("Select Workspace Folder")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let root_path = selected_path.into_path().map_err(|err| {
        CommandError::new(
            "workspace_path_invalid",
            "Selected workspace path cannot be used",
            Some(err.to_string()),
        )
    })?;
    open_workspace_root(root_path, &registry).map(Some)
}

#[cfg(not(test))]
#[tauri::command]
pub fn open_workspace_path(
    root_path: String,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceHandle, CommandError> {
    open_workspace_root(PathBuf::from(root_path), &registry)
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_workspace_files(
    workspace_id: Option<String>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<Vec<WorkspaceFileEntry>, CommandError> {
    let (id, root) = resolve_workspace(workspace_id, &registry)?;
    list_workspace_files_impl(&id, &root)
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_workspace_file(
    workspace_id: Option<String>,
    path: String,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceFileContent, CommandError> {
    let (_, root) = resolve_workspace(workspace_id, &registry)?;
    read_workspace_file_impl(&root, &path)
}

#[cfg(not(test))]
#[tauri::command]
pub fn write_workspace_file(
    workspace_id: Option<String>,
    path: String,
    content: String,
    base_hash: Option<String>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceWriteResult, CommandError> {
    let (_, root) = resolve_workspace(workspace_id, &registry)?;
    write_workspace_file_impl(&root, &path, &content, base_hash.as_deref())
}

impl WorkspaceRegistry {
    #[cfg(not(test))]
    pub(crate) fn remember(&self, workspace_id: String, root: PathBuf) -> Result<(), CommandError> {
        let mut roots = self.roots.lock().map_err(|_| {
            CommandError::new(
                "registry_unavailable",
                "Workspace registry is unavailable",
                None,
            )
        })?;
        roots.insert(workspace_id, root);
        Ok(())
    }

    #[cfg(not(test))]
    fn get(&self, workspace_id: &str) -> Result<Option<PathBuf>, CommandError> {
        let roots = self.roots.lock().map_err(|_| {
            CommandError::new(
                "registry_unavailable",
                "Workspace registry is unavailable",
                None,
            )
        })?;
        Ok(roots.get(workspace_id).cloned())
    }
}

impl CommandError {
    pub(crate) fn new(code: &str, message: &str, detail: Option<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            detail,
        }
    }

    pub(crate) fn io(code: &str, message: &str, err: std::io::Error) -> Self {
        Self::new(code, message, Some(err.to_string()))
    }
}

#[cfg(not(test))]
fn open_workspace_root(
    root_path: PathBuf,
    registry: &WorkspaceRegistry,
) -> Result<WorkspaceHandle, CommandError> {
    let root = canonical_workspace_root(Some(&root_path.display().to_string()))?;
    let handle = workspace_handle(&root)?;
    registry.remember(handle.workspace_id.clone(), root)?;
    Ok(handle)
}

#[cfg(not(test))]
fn resolve_workspace(
    workspace_id: Option<String>,
    registry: &WorkspaceRegistry,
) -> Result<(String, PathBuf), CommandError> {
    let workspace_id = workspace_id.ok_or_else(not_selected)?;
    let root = registry.get(&workspace_id)?.ok_or_else(|| {
        CommandError::new(
            "workspace_not_found",
            "Workspace handle is not registered in this session",
            Some(workspace_id.clone()),
        )
    })?;
    Ok((workspace_id, root))
}

pub(crate) fn not_selected() -> CommandError {
    CommandError::new(
        "workspace_not_selected",
        "No workspace path was provided",
        Some("Open a workspace through the native folder picker first".into()),
    )
}
