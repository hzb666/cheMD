use crate::workspace::{not_selected, CommandError, WorkspaceFileEntry, WorkspaceHandle};
use crate::workspace_path::{chemd_kind_for_path, relative_path};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 1_000;
const MAX_CHILDREN_PER_DIR: usize = 256;
const IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".turbo",
    ".ruff_cache",
    ".pytest_cache",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
];
const SENSITIVE_FILES: &[&str] = &[
    ".env",
    ".env.local",
    ".env.development",
    ".env.production",
    ".npmrc",
    ".pypirc",
];

pub(crate) fn canonical_workspace_root(root_path: Option<&str>) -> Result<PathBuf, CommandError> {
    let root_path = root_path
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(not_selected)?;
    let root = fs::canonicalize(root_path).map_err(|err| {
        CommandError::io(
            "workspace_not_found",
            "Workspace path cannot be opened",
            err,
        )
    })?;
    if !root.is_dir() {
        return Err(CommandError::new(
            "workspace_not_directory",
            "Workspace path is not a directory",
            Some(root.display().to_string()),
        ));
    }
    Ok(root)
}

pub(crate) fn workspace_handle(root: &Path) -> Result<WorkspaceHandle, CommandError> {
    let metadata = fs::metadata(root).map_err(|err| {
        CommandError::io(
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
) -> Result<Vec<WorkspaceFileEntry>, CommandError> {
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
) -> Result<(), CommandError> {
    if depth >= MAX_DEPTH || entries.len() >= MAX_ENTRIES {
        return Ok(());
    }

    let children = read_workspace_children(dir)?;
    if children.len() > MAX_CHILDREN_PER_DIR {
        return Ok(());
    }

    for child in children {
        if entries.len() >= MAX_ENTRIES {
            break;
        }
        let file_type = child.file_type().map_err(|err| {
            CommandError::io(
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
        if should_ignore_workspace_path(Path::new(&relative)) {
            continue;
        }
        if file_type.is_dir() {
            entries.push(file_entry(
                workspace_id,
                &path,
                &relative,
                "directory",
                None,
            ));
            visit_directory(workspace_id, root, &path, depth + 1, entries)?;
        } else if file_type.is_file() {
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

fn read_workspace_children(dir: &Path) -> Result<Vec<fs::DirEntry>, CommandError> {
    let mut children = Vec::new();
    let read_dir = fs::read_dir(dir).map_err(|err| {
        CommandError::io(
            "workspace_list_failed",
            "Workspace directory cannot be read",
            err,
        )
    })?;

    for child in read_dir {
        let child = child.map_err(|err| {
            CommandError::io(
                "workspace_list_failed",
                "Workspace entry cannot be read",
                err,
            )
        })?;
        if should_ignore_name(&child.file_name()) {
            continue;
        }
        children.push(child);
        if children.len() > MAX_CHILDREN_PER_DIR {
            break;
        }
    }
    children.sort_by_key(|entry| entry.file_name());
    Ok(children)
}

pub(crate) fn should_ignore_workspace_path(path: &Path) -> bool {
    path.components().any(|component| {
        let std::path::Component::Normal(name) = component else {
            return false;
        };
        should_ignore_name(name)
    })
}

fn should_ignore_name(name: &std::ffi::OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let normalized = name.to_ascii_lowercase();
    normalized.starts_with('.')
        || IGNORED_DIRS.contains(&normalized.as_str())
        || SENSITIVE_FILES.contains(&normalized.as_str())
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
