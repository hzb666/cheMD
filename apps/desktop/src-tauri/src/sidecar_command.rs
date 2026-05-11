use crate::workspace::DesktopCommandError;
use std::{
    env,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SidecarCommandSpec {
    pub(crate) program: PathBuf,
    pub(crate) args: Vec<String>,
    pub(crate) cwd: PathBuf,
    pub(crate) label: String,
}

pub(crate) fn default_sidecar_command_spec() -> Result<SidecarCommandSpec, DesktopCommandError> {
    let service_dir = discover_service_dir().ok_or_else(|| {
        DesktopCommandError::new(
            "sidecar_service_not_found",
            "chem-service directory was not found",
            Some("Expected services/chem-service below the repo or workspace root".into()),
        )
    })?;
    Ok(command_spec_for_service_dir(&service_dir))
}

pub(crate) fn command_spec_for_service_dir(service_dir: &Path) -> SidecarCommandSpec {
    if let Some(python) = poetry_venv_python(service_dir) {
        return SidecarCommandSpec {
            program: python,
            args: vec!["app.py".into()],
            cwd: service_dir.into(),
            label: "Poetry venv python app.py".into(),
        };
    }

    SidecarCommandSpec {
        program: PathBuf::from("poetry"),
        args: vec!["run".into(), "python".into(), "app.py".into()],
        cwd: service_dir.into(),
        label: "poetry run python app.py".into(),
    }
}

pub(crate) fn find_service_dir_from(start: &Path) -> Option<PathBuf> {
    for ancestor in start.ancestors() {
        let candidate = ancestor.join("services").join("chem-service");
        if is_service_dir(&candidate) {
            return Some(candidate);
        }
    }
    None
}

fn discover_service_dir() -> Option<PathBuf> {
    let mut starts = Vec::new();
    if let Ok(cwd) = env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        starts.push(PathBuf::from(manifest_dir));
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            starts.push(parent.into());
        }
    }

    starts.iter().find_map(|start| find_service_dir_from(start))
}

fn poetry_venv_python(service_dir: &Path) -> Option<PathBuf> {
    let python = service_dir.join(".venv").join(venv_python_relative_path());
    python.is_file().then_some(python)
}

#[cfg(windows)]
fn venv_python_relative_path() -> PathBuf {
    PathBuf::from("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python_relative_path() -> PathBuf {
    PathBuf::from("bin").join("python")
}

fn is_service_dir(path: &Path) -> bool {
    path.join("app.py").is_file() && path.join("pyproject.toml").is_file()
}
