use crate::workspace::DesktopCommandError;
use std::path::{Component, Path, PathBuf};

pub(crate) fn clean_relative_path(path: &str) -> Result<PathBuf, DesktopCommandError> {
    let path = Path::new(path.trim());
    let mut clean = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            _ => return Err(outside_root(path)),
        }
    }
    if clean.as_os_str().is_empty() {
        return Err(DesktopCommandError::new(
            "workspace_path_empty",
            "Workspace file path is empty",
            None,
        ));
    }
    Ok(clean)
}

pub(crate) fn relative_path(root: &Path, path: &Path) -> Result<String, DesktopCommandError> {
    path.strip_prefix(root)
        .map(relative_to_string)
        .map_err(|_| outside_root(path))
}

pub(crate) fn relative_to_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => part.to_str(),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

pub(crate) fn chemd_kind_for_path(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_str()?.to_ascii_lowercase();
    if name.ends_with(".chemd.md") {
        Some("document".into())
    } else if name.ends_with(".md") {
        Some("unknown".into())
    } else {
        None
    }
}

pub(crate) fn outside_root(path: &Path) -> DesktopCommandError {
    DesktopCommandError::new(
        "workspace_path_outside_root",
        "Workspace file path must stay inside the workspace root",
        Some(path.display().to_string()),
    )
}
