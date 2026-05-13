use crate::workspace::{not_selected, DesktopCommandError, WorkspaceFileEntry, WorkspaceHandle};
use crate::workspace_path::{chemd_kind_for_path, relative_path};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 1_000;
const MAX_CHILDREN_PER_DIR: usize = 256;

pub(crate) fn canonical_workspace_root(
    root_path: Option<&str>,
) -> Result<PathBuf, DesktopCommandError> {
    let root_path = root_path
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(not_selected)?;
    let root = fs::canonicalize(root_path).map_err(|err| {
        DesktopCommandError::io(
            "workspace_not_found",
            "Workspace path cannot be opened",
            err,
        )
    })?;
    if !root.is_dir() {
        return Err(DesktopCommandError::new(
            "workspace_not_directory",
            "Workspace path is not a directory",
            Some(root.display().to_string()),
        ));
    }
    Ok(root)
}

pub(crate) fn workspace_handle(root: &Path) -> Result<WorkspaceHandle, DesktopCommandError> {
    let metadata = fs::metadata(root).map_err(|err| {
        DesktopCommandError::io(
            "workspace_unavailable",
            "Workspace metadata cannot be read",
            err,
        )
    })?;
    Ok(WorkspaceHandle {
        workspace_id: workspace_id_for_root(root),
        display_name: root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("Workspace")
            .to_string(),
        root_path: root.display().to_string(),
        root_hint: root.display().to_string(),
        writable: !metadata.permissions().readonly(),
    })
}

pub(crate) fn list_workspace_files_impl(
    workspace_id: &str,
    root: &Path,
) -> Result<Vec<WorkspaceFileEntry>, DesktopCommandError> {
    let mut entries = Vec::new();
    visit_directory(workspace_id, root, root, 0, &mut entries)?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(entries)
}

fn visit_directory(
    workspace_id: &str,
    root: &Path,
    dir: &Path,
    depth: usize,
    entries: &mut Vec<WorkspaceFileEntry>,
) -> Result<(), DesktopCommandError> {
    if depth >= MAX_DEPTH || entries.len() >= MAX_ENTRIES {
        return Ok(());
    }

    let children = read_visible_children(dir)?;
    if children.len() > MAX_CHILDREN_PER_DIR {
        return Ok(());
    }

    for child in children {
        if entries.len() >= MAX_ENTRIES {
            break;
        }
        let file_type = child.file_type().map_err(|err| {
            DesktopCommandError::io(
                "workspace_list_failed",
                "Workspace entry cannot be read",
                err,
            )
        })?;
        if file_type.is_symlink() {
            continue;
        }

        let path = child.path();
        let relative = relative_path(root, &path)?;
        if file_type.is_dir() {
            entries.push(file_entry(
                workspace_id,
                &path,
                &relative,
                "directory",
                None,
            ));
            visit_directory(workspace_id, root, &path, depth + 1, entries)?;
        } else if file_type.is_file() && is_markdown_file(&path) {
            entries.push(file_entry(
                workspace_id,
                &path,
                &relative,
                "file",
                chemd_kind_for_path(&path),
            ));
        }
    }
    Ok(())
}

fn read_visible_children(dir: &Path) -> Result<Vec<fs::DirEntry>, DesktopCommandError> {
    let mut children = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|err| {
        DesktopCommandError::io(
            "workspace_list_failed",
            "Workspace directory cannot be read",
            err,
        )
    })?;

    for child in read_dir {
        let child = child.map_err(|err| {
            DesktopCommandError::io(
                "workspace_list_failed",
                "Workspace entry cannot be read",
                err,
            )
        })?;
        if !is_hidden_name(&child.file_name()) {
            children.push(child);
        }
        if children.len() > MAX_CHILDREN_PER_DIR {
            break;
        }
    }
    children.sort_by_key(|entry| entry.file_name());
    Ok(children)
}

fn file_entry(
    workspace_id: &str,
    path: &Path,
    relative: &str,
    kind: &str,
    chemd_kind: Option<String>,
) -> WorkspaceFileEntry {
    WorkspaceFileEntry {
        id: format!("{workspace_id}:{relative}"),
        name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string(),
        path: relative.into(),
        kind: kind.into(),
        chemd_kind,
    }
}

fn is_markdown_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_ascii_lowercase().ends_with(".md"))
        .unwrap_or(false)
}

fn is_hidden_name(name: &std::ffi::OsStr) -> bool {
    name.to_str()
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

pub(crate) fn workspace_id_for_root(root: &Path) -> String {
    let normalized = root.display().to_string().to_ascii_lowercase();
    let hash = normalized
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325_u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    format!("workspace-{hash:016x}")
}
