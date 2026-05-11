use crate::workspace::{DesktopCommandError, WorkspaceFileContent, WorkspaceWriteResult};
use crate::workspace_path::{
    chemd_kind_for_path, clean_relative_path, outside_root, relative_to_string,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_READ_BYTES: u64 = 2 * 1024 * 1024;

pub(crate) fn read_workspace_file_impl(
    root: &Path,
    path: &str,
) -> Result<WorkspaceFileContent, DesktopCommandError> {
    let relative = clean_relative_path(path)?;
    let target = canonical_existing_file(root, &relative)?;
    let metadata = fs::metadata(&target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_read_failed",
            "Workspace file metadata failed",
            err,
        )
    })?;
    if metadata.len() > MAX_READ_BYTES {
        return Err(DesktopCommandError::new(
            "workspace_file_too_large",
            "Workspace file is too large to read safely",
            Some(relative_to_string(&relative)),
        ));
    }
    let content = fs::read_to_string(&target).map_err(|err| {
        DesktopCommandError::io(
            "workspace_read_failed",
            "Workspace file cannot be read",
            err,
        )
    })?;
    Ok(WorkspaceFileContent {
        path: relative_to_string(&relative),
        bytes: content.len(),
        content,
        chemd_kind: chemd_kind_for_path(&target),
    })
}

pub(crate) fn write_workspace_file_impl(
    root: &Path,
    path: &str,
    content: &str,
) -> Result<WorkspaceWriteResult, DesktopCommandError> {
    let relative = clean_relative_path(path)?;
    let target = root.join(&relative);
    ensure_write_target_inside_root(root, &target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            DesktopCommandError::io(
                "workspace_write_failed",
                "Workspace directory cannot be created",
                err,
            )
        })?;
    }
    fs::write(&target, content).map_err(|err| {
        DesktopCommandError::io(
            "workspace_write_failed",
            "Workspace file cannot be written",
            err,
        )
    })?;
    Ok(WorkspaceWriteResult {
        path: relative_to_string(&relative),
        bytes: content.len(),
        chemd_kind: chemd_kind_for_path(&target),
    })
}

fn canonical_existing_file(root: &Path, relative: &Path) -> Result<PathBuf, DesktopCommandError> {
    let target = fs::canonicalize(root.join(relative)).map_err(|err| {
        DesktopCommandError::io(
            "workspace_file_not_found",
            "Workspace file cannot be found",
            err,
        )
    })?;
    if !target.starts_with(root) {
        return Err(outside_root(relative));
    }
    if !target.is_file() {
        return Err(DesktopCommandError::new(
            "workspace_not_file",
            "Workspace path is not a file",
            Some(relative.display().to_string()),
        ));
    }
    Ok(target)
}

fn ensure_write_target_inside_root(root: &Path, target: &Path) -> Result<(), DesktopCommandError> {
    if target.exists() {
        let canonical = fs::canonicalize(target).map_err(|err| {
            DesktopCommandError::io(
                "workspace_write_failed",
                "Workspace target cannot be checked",
                err,
            )
        })?;
        if !canonical.starts_with(root) || canonical.is_dir() {
            return Err(outside_root(target));
        }
        return Ok(());
    }

    let mut ancestor = target.parent();
    while let Some(path) = ancestor {
        if path.exists() {
            let canonical = fs::canonicalize(path).map_err(|err| {
                DesktopCommandError::io(
                    "workspace_write_failed",
                    "Workspace parent cannot be checked",
                    err,
                )
            })?;
            return if canonical.starts_with(root) {
                Ok(())
            } else {
                Err(outside_root(target))
            };
        }
        ancestor = path.parent();
    }
    Err(outside_root(target))
}
