use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, sync::Mutex};

#[cfg(not(test))]
use crate::{
    workspace_file_io::{read_workspace_file_impl, write_workspace_file_impl},
    workspace_io::{
        canonical_workspace_root, list_workspace_files_impl, workspace_handle,
        workspace_id_for_root,
    },
};

#[derive(Default)]
#[cfg_attr(test, allow(dead_code))]
pub struct WorkspaceRegistry {
    roots: Mutex<HashMap<String, PathBuf>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopCommandError {
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
    pub(crate) chemd_kind: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWriteResult {
    pub(crate) path: String,
    pub(crate) bytes: usize,
    pub(crate) chemd_kind: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
pub fn open_workspace(
    root_path: Option<String>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceHandle, DesktopCommandError> {
    let root = canonical_workspace_root(root_path.as_deref())?;
    let handle = workspace_handle(&root)?;
    registry.remember(handle.workspace_id.clone(), root)?;
    Ok(handle)
}

#[cfg(not(test))]
#[tauri::command]
pub fn list_workspace_files(
    workspace_id: Option<String>,
    root_path: Option<String>,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<Vec<WorkspaceFileEntry>, DesktopCommandError> {
    let (id, root) = resolve_workspace(workspace_id, root_path, &registry)?;
    list_workspace_files_impl(&id, &root)
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_workspace_file(
    workspace_id: Option<String>,
    root_path: Option<String>,
    path: String,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceFileContent, DesktopCommandError> {
    let (_, root) = resolve_workspace(workspace_id, root_path, &registry)?;
    read_workspace_file_impl(&root, &path)
}

#[cfg(not(test))]
#[tauri::command]
pub fn write_workspace_file(
    workspace_id: Option<String>,
    root_path: Option<String>,
    path: String,
    content: String,
    registry: tauri::State<'_, WorkspaceRegistry>,
) -> Result<WorkspaceWriteResult, DesktopCommandError> {
    let (_, root) = resolve_workspace(workspace_id, root_path, &registry)?;
    write_workspace_file_impl(&root, &path, &content)
}

impl WorkspaceRegistry {
    #[cfg(not(test))]
    pub(crate) fn remember(
        &self,
        workspace_id: String,
        root: PathBuf,
    ) -> Result<(), DesktopCommandError> {
        let mut roots = self.roots.lock().map_err(|_| {
            DesktopCommandError::new(
                "registry_unavailable",
                "Workspace registry is unavailable",
                None,
            )
        })?;
        roots.insert(workspace_id, root);
        Ok(())
    }

    #[cfg(not(test))]
    fn get(&self, workspace_id: &str) -> Result<Option<PathBuf>, DesktopCommandError> {
        let roots = self.roots.lock().map_err(|_| {
            DesktopCommandError::new(
                "registry_unavailable",
                "Workspace registry is unavailable",
                None,
            )
        })?;
        Ok(roots.get(workspace_id).cloned())
    }
}

impl DesktopCommandError {
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
fn resolve_workspace(
    workspace_id: Option<String>,
    root_path: Option<String>,
    registry: &WorkspaceRegistry,
) -> Result<(String, PathBuf), DesktopCommandError> {
    if let Some(root_path) = root_path {
        let root = canonical_workspace_root(Some(&root_path))?;
        let id = workspace_id.unwrap_or_else(|| workspace_id_for_root(&root));
        registry.remember(id.clone(), root.clone())?;
        return Ok((id, root));
    }

    let workspace_id = workspace_id.ok_or_else(not_selected)?;
    let root = registry.get(&workspace_id)?.ok_or_else(|| {
        DesktopCommandError::new(
            "workspace_not_found",
            "Workspace handle is not registered in this session",
            Some(workspace_id.clone()),
        )
    })?;
    Ok((workspace_id, root))
}

pub(crate) fn not_selected() -> DesktopCommandError {
    DesktopCommandError::new(
        "workspace_not_selected",
        "No workspace path was provided",
        Some("Pass rootPath to open a local directory".into()),
    )
}
