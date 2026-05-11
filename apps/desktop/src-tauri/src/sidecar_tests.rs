use crate::{
    sidecar::{
        sidecar_health::{probe_health_once, HealthProbeConfig, HealthProbeOutcome},
        SidecarManager,
    },
    sidecar_command::{
        command_spec_for_service_dir, default_sidecar_command_spec, find_service_dir_from,
    },
    sidecar_log::LogTail,
};
use std::{
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::{Path, PathBuf},
    thread,
    time::Duration,
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
fn health_probe_reports_ready_for_http_success() {
    let server = spawn_http_once("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");

    let outcome = probe_health_once(&server.url, Duration::from_millis(300));

    assert_eq!(outcome, HealthProbeOutcome::Ready);
    server.join();
}

#[test]
fn health_probe_reports_not_ready_when_port_is_closed() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test port should bind");
    let url = format!("http://{}/healthz", listener.local_addr().unwrap());
    drop(listener);

    let outcome = probe_health_once(&url, Duration::from_millis(50));

    assert_not_ready_contains(outcome, "connect failed");
}

#[test]
fn health_probe_reports_not_ready_when_response_times_out() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test port should bind");
    let url = format!("http://{}/healthz", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("health request should connect");
        let mut request = [0_u8; 128];
        let _ = stream.read(&mut request);
        thread::sleep(Duration::from_millis(200));
    });

    let outcome = probe_health_once(&url, Duration::from_millis(50));

    assert_not_ready_contains(outcome, "response failed");
    handle.join().expect("server thread should finish");
}

#[test]
fn start_reports_ready_only_after_healthz_success() {
    let manager = SidecarManager::default();
    let server = spawn_http_once("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok");

    let started = manager
        .start_with_spec_and_health_config(long_running_command_spec(), health_config(&server.url))
        .expect("long running command should spawn");

    assert_eq!(json_field(&started, "state"), "ready");
    assert!(json_field(&started, "detail").contains("/healthz is ready"));
    assert!(serde_json::to_value(&started)
        .expect("status should serialize")
        .get("pid")
        .and_then(|pid| pid.as_u64())
        .is_some());
    server.join();
    let _ = manager.stop();
}

#[test]
fn start_reports_degraded_when_healthz_is_not_ready() {
    let manager = SidecarManager::default();
    let listener = TcpListener::bind("127.0.0.1:0").expect("test port should bind");
    let url = format!("http://{}/healthz", listener.local_addr().unwrap());
    drop(listener);

    let started = manager
        .start_with_spec_and_health_config(long_running_command_spec(), health_config(&url))
        .expect("long running command should spawn");

    assert_eq!(json_field(&started, "state"), "degraded");
    assert!(json_field(&started, "detail").contains("not ready"));
    assert!(serde_json::to_value(&started)
        .expect("status should serialize")
        .get("pid")
        .and_then(|pid| pid.as_u64())
        .is_some());
    let _ = manager.stop();
}

#[test]
fn status_reports_degraded_after_owned_child_exits() {
    let manager = SidecarManager::default();
    let spec = quick_exit_command_spec();

    let started = manager
        .start_with_spec_and_health_config(spec, fast_failing_health_config())
        .expect("quick command should spawn");
    assert_eq!(json_field(&started, "state"), "degraded");

    thread::sleep(Duration::from_millis(150));
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

fn assert_not_ready_contains(outcome: HealthProbeOutcome, expected: &str) {
    match outcome {
        HealthProbeOutcome::Ready => panic!("health probe unexpectedly reported ready"),
        HealthProbeOutcome::NotReady(detail) => assert!(detail.contains(expected)),
    }
}

struct TestHttpServer {
    url: String,
    handle: thread::JoinHandle<()>,
}

impl TestHttpServer {
    fn join(self) {
        self.handle.join().expect("server thread should finish");
    }
}

fn spawn_http_once(response: &'static str) -> TestHttpServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test server should bind");
    let url = format!("http://{}/healthz", listener.local_addr().unwrap());
    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("health request should connect");
        let mut request = [0_u8; 128];
        let _ = stream.read(&mut request);
        stream
            .write_all(response.as_bytes())
            .expect("health response should be written");
    });
    TestHttpServer { url, handle }
}

fn health_config(url: &str) -> HealthProbeConfig {
    HealthProbeConfig {
        url: url.into(),
        attempts: 1,
        timeout: Duration::from_millis(100),
        retry_delay: Duration::from_millis(1),
    }
}

fn fast_failing_health_config() -> HealthProbeConfig {
    let listener = TcpListener::bind("127.0.0.1:0").expect("test port should bind");
    let url = format!("http://{}/healthz", listener.local_addr().unwrap());
    drop(listener);
    health_config(&url)
}

fn quick_exit_command_spec() -> crate::sidecar_command::SidecarCommandSpec {
    crate::sidecar_command::SidecarCommandSpec {
        program: quick_exit_program(),
        args: quick_exit_args(),
        cwd: std::env::temp_dir(),
        label: "quick exit test command".into(),
    }
}

fn long_running_command_spec() -> crate::sidecar_command::SidecarCommandSpec {
    crate::sidecar_command::SidecarCommandSpec {
        program: long_running_program(),
        args: long_running_args(),
        cwd: std::env::temp_dir(),
        label: "long running test command".into(),
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
fn long_running_program() -> PathBuf {
    PathBuf::from("powershell")
}

#[cfg(windows)]
fn long_running_args() -> Vec<String> {
    vec![
        "-NoProfile".into(),
        "-Command".into(),
        "Start-Sleep -Seconds 10".into(),
    ]
}

#[cfg(not(windows))]
fn long_running_program() -> PathBuf {
    PathBuf::from("sh")
}

#[cfg(not(windows))]
fn long_running_args() -> Vec<String> {
    vec!["-c".into(), "sleep 10".into()]
}

#[cfg(windows)]
fn venv_python_relative_path() -> PathBuf {
    Path::new("Scripts").join("python.exe")
}

#[cfg(not(windows))]
fn venv_python_relative_path() -> PathBuf {
    Path::new("bin").join("python")
}
