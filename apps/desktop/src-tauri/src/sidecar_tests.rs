use crate::{
    sidecar::SidecarManager,
    sidecar_command::{
        command_spec_for_service_dir, default_sidecar_command_spec, find_service_dir_from,
    },
    sidecar_log::LogTail,
};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

struct TestTree {
    root: PathBuf,
}

impl TestTree {
    fn new(name: &str) -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be valid")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("chemd-sidecar-{name}-{suffix}"));
        fs::create_dir_all(&root).expect("test tree should be created");
        Self { root }
    }

    fn service_dir(&self) -> PathBuf {
        self.root.join("services").join("chem-service")
    }

    fn create_service(&self) {
        let service_dir = self.service_dir();
        fs::create_dir_all(&service_dir).expect("service directory should be created");
        fs::write(service_dir.join("app.py"), "print('ok')")
            .expect("service app should be written");
        fs::write(service_dir.join("pyproject.toml"), "[tool.poetry]")
            .expect("pyproject should be written");
    }
}

impl Drop for TestTree {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn command_spec_prefers_existing_poetry_venv_python() {
    let tree = TestTree::new("venv");
    tree.create_service();
    let python = tree
        .service_dir()
        .join(".venv")
        .join(venv_python_relative_path());
    fs::create_dir_all(python.parent().expect("python should have parent"))
        .expect("venv scripts directory should be created");
    fs::write(&python, "").expect("python marker should be written");

    let spec = command_spec_for_service_dir(&tree.service_dir());

    assert_eq!(spec.program, python);
    assert_eq!(spec.args, vec!["app.py"]);
    assert_eq!(spec.cwd, tree.service_dir());
}

#[test]
fn command_spec_falls_back_to_poetry_run_python() {
    let tree = TestTree::new("poetry");
    tree.create_service();

    let spec = command_spec_for_service_dir(&tree.service_dir());

    assert_eq!(spec.program, PathBuf::from("poetry"));
    assert_eq!(spec.args, vec!["run", "python", "app.py"]);
    assert_eq!(spec.cwd, tree.service_dir());
}

#[test]
fn service_dir_can_be_found_from_repo_descendant() {
    let tree = TestTree::new("discover");
    tree.create_service();
    let descendant = tree.root.join("apps").join("desktop").join("src-tauri");
    fs::create_dir_all(&descendant).expect("descendant should be created");

    let found = find_service_dir_from(&descendant).expect("service dir should be found");

    assert_eq!(found, tree.service_dir());
}

#[test]
fn default_command_spec_finds_repo_service_dir() {
    let spec = default_sidecar_command_spec().expect("repo service dir should be discoverable");

    assert!(spec
        .cwd
        .ends_with(Path::new("services").join("chem-service")));
    assert!(spec.args.iter().any(|arg| arg == "app.py"));
}

#[test]
fn stop_without_started_sidecar_returns_offline_status() {
    let manager = SidecarManager::default();

    let status = manager.stop().expect("idle stop should not fail");

    assert_eq!(json_field(&status, "state"), "offline");
    assert!(json_field(&status, "detail").contains("not running"));
}

#[test]
fn read_logs_without_started_sidecar_returns_empty_tail() {
    let manager = SidecarManager::default();

    let logs = manager.logs().expect("idle logs should not fail");

    assert!(serde_json::to_value(logs)
        .expect("logs should serialize")
        .get("lines")
        .and_then(|lines| lines.as_array())
        .expect("lines should be an array")
        .is_empty());
}

#[test]
fn status_reports_degraded_after_owned_child_exits() {
    let manager = SidecarManager::default();
    let spec = quick_exit_command_spec();

    let started = manager
        .start_with_spec(spec)
        .expect("quick command should spawn");
    assert_eq!(json_field(&started, "state"), "ready");

    std::thread::sleep(std::time::Duration::from_millis(150));
    let status = manager.status().expect("status should be readable");

    assert_eq!(json_field(&status, "state"), "degraded");
    assert!(json_field(&status, "detail").contains("exited"));
}

#[test]
fn log_tail_keeps_only_latest_lines() {
    let mut tail = LogTail::new(3);

    for index in 0..5 {
        tail.push("stdout", &format!("line-{index}"));
    }

    assert_eq!(
        tail.lines(),
        vec!["[stdout] line-2", "[stdout] line-3", "[stdout] line-4"]
    );
}

fn json_field<T>(value: &T, field: &str) -> String
where
    T: serde::Serialize,
{
    serde_json::to_value(value)
        .expect("value should serialize")
        .get(field)
        .and_then(|value| value.as_str())
        .expect("field should be a string")
        .to_string()
}

fn quick_exit_command_spec() -> crate::sidecar_command::SidecarCommandSpec {
    crate::sidecar_command::SidecarCommandSpec {
        program: quick_exit_program(),
        args: quick_exit_args(),
        cwd: std::env::temp_dir(),
        label: "quick exit test command".into(),
    }
}

#[cfg(windows)]
fn quick_exit_program() -> PathBuf {
    PathBuf::from("cmd")
}

#[cfg(windows)]
fn quick_exit_args() -> Vec<String> {
    vec!["/C".into(), "exit 0".into()]
}

#[cfg(not(windows))]
fn quick_exit_program() -> PathBuf {
    PathBuf::from("sh")
}

#[cfg(not(windows))]
fn quick_exit_args() -> Vec<String> {
    vec!["-c".into(), "exit 0".into()]
}

#[cfg(windows)]
fn venv_python_relative_path() -> PathBuf {
    Path::new("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python_relative_path() -> PathBuf {
    Path::new("bin").join("python")
}
