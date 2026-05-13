#![cfg_attr(test, allow(dead_code))]

use crate::workspace::DesktopCommandError;
use serde::Serialize;
use serde_json::Value;
use std::{
    env, fs,
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const TAIL_LINE_COUNT: usize = 20;
const TAIL_LINE_MAX_CHARS: usize = 500;
const TAIL_CAPTURE_MAX_BYTES: usize = 64 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 120_000;
const MIN_TIMEOUT_MS: u64 = 1_000;
const MAX_TIMEOUT_MS: u64 = 600_000;
const WAIT_POLL_MS: u64 = 25;
const TIMEOUT_DRAIN_MS: u64 = 50;
static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[rustfmt::skip]
#[derive(Debug, Clone)]
pub(crate) struct ReactionIntelligenceWorkerInput { pub(crate) job_json: Value, pub(crate) providers: Option<Vec<String>>, pub(crate) missing_dependency: Option<String>, pub(crate) pretty: Option<bool>, pub(crate) timeout_ms: Option<u64> }

#[rustfmt::skip]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionIntelligenceWorkerResult { status: String, message: String, reason: Option<String>, detail: Option<String>, artifact_json: Option<Value>, exit_code: Option<i32>, stdout_tail: Vec<String>, stderr_tail: Vec<String> }

#[rustfmt::skip]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ReactionIntelligenceWorkerSpec { pub(crate) program: PathBuf, pub(crate) args: Vec<String>, pub(crate) cwd: PathBuf, pub(crate) input_path: PathBuf, pub(crate) output_path: PathBuf, pub(crate) timeout_ms: u64 }

#[rustfmt::skip]
#[derive(Debug)]
pub(crate) struct WorkerProcessOutput { pub(crate) exit_code: Option<i32>, pub(crate) stdout_tail: Vec<String>, pub(crate) stderr_tail: Vec<String>, pub(crate) timed_out: bool }

#[rustfmt::skip]
pub(crate) struct WorkerTempPaths { input_path: PathBuf, output_path: PathBuf }

struct PipeCapture {
    buffer: Arc<Mutex<Vec<u8>>>,
    handle: Option<JoinHandle<()>>,
}

#[cfg(not(test))]
#[tauri::command]
pub fn run_reaction_intelligence_worker(
    job_json: Value,
    providers: Option<Vec<String>>,
    missing_dependency: Option<String>,
    pretty: Option<bool>,
    timeout_ms: Option<u64>,
) -> Result<ReactionIntelligenceWorkerResult, DesktopCommandError> {
    run_reaction_intelligence_worker_impl(ReactionIntelligenceWorkerInput {
        job_json,
        providers,
        missing_dependency,
        pretty,
        timeout_ms,
    })
}

pub(crate) fn run_reaction_intelligence_worker_impl(
    input: ReactionIntelligenceWorkerInput,
) -> Result<ReactionIntelligenceWorkerResult, DesktopCommandError> {
    run_reaction_intelligence_worker_with(input, default_service_dir, execute_worker_spec)
}

#[rustfmt::skip]
pub(crate) fn run_reaction_intelligence_worker_with<F, G>(
    input: ReactionIntelligenceWorkerInput,
    service_dir: F,
    executor: G,
) -> Result<ReactionIntelligenceWorkerResult, DesktopCommandError>
where
    F: FnOnce() -> Option<PathBuf>,
    G: FnOnce(&ReactionIntelligenceWorkerSpec) -> Result<WorkerProcessOutput, io::Error>,
{
    let Some(service_dir) = service_dir() else {
        return Ok(worker_result("skipped", "Reaction intelligence worker service was not found", Some("reaction_intelligence_service_not_found".into()), None, None, None, Vec::new(), Vec::new()));
    };
    let temp_paths = WorkerTempPaths::new();
    let spec = worker_spec(&service_dir, &temp_paths, &input);
    let result = run_with_spec(&input.job_json, &spec, executor);
    cleanup_temp_paths(&temp_paths);
    result
}

pub(crate) fn worker_spec(
    service_dir: &Path,
    temp_paths: &WorkerTempPaths,
    input: &ReactionIntelligenceWorkerInput,
) -> ReactionIntelligenceWorkerSpec {
    let mut args = vec![
        "-m".into(),
        "chem_cluster_service.intelligence.cli".into(),
        "--input".into(),
        temp_paths.input_path.to_string_lossy().into_owned(),
        "--output".into(),
        temp_paths.output_path.to_string_lossy().into_owned(),
    ];
    if let Some(providers) = normalized_values(input.providers.as_deref()) {
        args.push("--providers".into());
        args.extend(providers);
    }
    if let Some(policy) = input
        .missing_dependency
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("--missing-dependency".into());
        args.push(policy.into());
    }
    if input.pretty.unwrap_or(false) {
        args.push("--pretty".into());
    }
    ReactionIntelligenceWorkerSpec {
        program: python_program(service_dir),
        args,
        cwd: service_dir.into(),
        input_path: temp_paths.input_path.clone(),
        output_path: temp_paths.output_path.clone(),
        timeout_ms: bounded_timeout_ms(input.timeout_ms),
    }
}

pub(crate) fn find_service_dir_from(start: &Path) -> Option<PathBuf> {
    start.ancestors().find_map(|ancestor| {
        let candidate = ancestor.join("services").join("chem-cluster-service");
        is_service_dir(&candidate).then_some(candidate)
    })
}

#[rustfmt::skip]
fn run_with_spec<G>(
    job_json: &Value,
    spec: &ReactionIntelligenceWorkerSpec,
    executor: G,
) -> Result<ReactionIntelligenceWorkerResult, DesktopCommandError>
where
    G: FnOnce(&ReactionIntelligenceWorkerSpec) -> Result<WorkerProcessOutput, io::Error>,
{
    write_job_json(&spec.input_path, job_json)?;
    let output = match executor(spec) {
        Ok(output) => output,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(worker_result("skipped", "Python executable for reaction intelligence worker was not found", Some("reaction_intelligence_python_not_found".into()), Some(error.to_string()), None, None, Vec::new(), Vec::new()));
        }
        Err(error) => {
            return Ok(worker_result("failed", "Failed to start reaction intelligence worker", Some("reaction_intelligence_worker_spawn_failed".into()), Some(error.to_string()), None, None, Vec::new(), Vec::new()));
        }
    };
    classify_worker_output(output, read_output_json(&spec.output_path))
}

#[rustfmt::skip]
fn classify_worker_output(
    output: WorkerProcessOutput,
    parsed: Result<Value, DesktopCommandError>,
) -> Result<ReactionIntelligenceWorkerResult, DesktopCommandError> {
    let exit_code = output.exit_code;
    if output.timed_out {
        let detail = first_tail_line(&output.stderr_tail)
            .or_else(|| first_tail_line(&output.stdout_tail))
            .or_else(|| Some("Timed out while waiting for worker process".into()));
        return Ok(worker_result("failed", "Reaction intelligence worker timed out", Some("reaction_intelligence_worker_timeout".into()), detail, None, exit_code, output.stdout_tail, output.stderr_tail));
    }
    if exit_code == Some(0) {
        return Ok(worker_result("completed", "Reaction intelligence worker completed", None, None, Some(parsed?), exit_code, output.stdout_tail, output.stderr_tail));
    }
    let reason = parsed
        .ok()
        .and_then(|value| structured_failure_reason(&value))
        .unwrap_or_else(|| "reaction_intelligence_worker_exit_nonzero".into());
    let detail =
        first_tail_line(&output.stderr_tail).or_else(|| first_tail_line(&output.stdout_tail));
    Ok(worker_result("failed", "Reaction intelligence worker failed", Some(reason), detail, None, exit_code, output.stdout_tail, output.stderr_tail))
}

#[rustfmt::skip]
pub(crate) fn execute_worker_spec(
    spec: &ReactionIntelligenceWorkerSpec,
) -> Result<WorkerProcessOutput, io::Error> {
    let mut child = Command::new(&spec.program)
        .args(&spec.args)
        .current_dir(&spec.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stdout = PipeCapture::from_reader(child.stdout.take());
    let mut stderr = PipeCapture::from_reader(child.stderr.take());
    let status = wait_child_bounded(&mut child, Duration::from_millis(spec.timeout_ms))?;
    let timed_out = status.is_none();
    if timed_out {
        thread::sleep(Duration::from_millis(TIMEOUT_DRAIN_MS));
    }
    let stdout_bytes = stdout.collect(!timed_out);
    let stderr_bytes = stderr.collect(!timed_out);
    Ok(WorkerProcessOutput { exit_code: status.and_then(|status| status.code()), stdout_tail: tail_lines(&stdout_bytes), stderr_tail: tail_lines(&stderr_bytes), timed_out })
}

fn default_service_dir() -> Option<PathBuf> {
    let mut starts = Vec::new();
    if let Ok(cwd) = env::current_dir() {
        starts.push(cwd);
    }
    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        starts.push(PathBuf::from(manifest_dir));
    }
    if let Ok(exe) = env::current_exe() {
        starts.extend(exe.parent().map(PathBuf::from));
    }
    starts.iter().find_map(|start| find_service_dir_from(start))
}

fn python_program(service_dir: &Path) -> PathBuf {
    [
        service_dir.join(".venv").join("Scripts").join("python.exe"),
        service_dir.join(".venv").join("bin").join("python"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .unwrap_or_else(|| PathBuf::from("python"))
}

#[rustfmt::skip]
fn write_job_json(path: &Path, job_json: &Value) -> Result<(), DesktopCommandError> {
    let json = serde_json::to_string_pretty(job_json).map_err(|error| {
        DesktopCommandError::new("reaction_intelligence_job_serialize_failed", "Failed to serialize reaction intelligence job JSON", Some(error.to_string()))
    })?;
    fs::write(path, format!("{json}\n")).map_err(|error| {
        DesktopCommandError::io("reaction_intelligence_job_write_failed", "Failed to write reaction intelligence worker input", error)
    })
}

#[rustfmt::skip]
fn read_output_json(path: &Path) -> Result<Value, DesktopCommandError> {
    let content = fs::read_to_string(path).map_err(|error| {
        DesktopCommandError::io("reaction_intelligence_output_read_failed", "Failed to read reaction intelligence worker output", error)
    })?;
    serde_json::from_str(&content).map_err(|error| {
        DesktopCommandError::new("reaction_intelligence_output_parse_failed", "Failed to parse reaction intelligence worker output", Some(error.to_string()))
    })
}

#[rustfmt::skip]
fn worker_result(
    status: &str,
    message: &str,
    reason: Option<String>,
    detail: Option<String>,
    artifact_json: Option<Value>,
    exit_code: Option<i32>,
    stdout_tail: Vec<String>,
    stderr_tail: Vec<String>,
) -> ReactionIntelligenceWorkerResult {
    ReactionIntelligenceWorkerResult { status: status.into(), message: message.into(), reason, detail, artifact_json, exit_code, stdout_tail, stderr_tail }
}
fn is_service_dir(path: &Path) -> bool {
    path.join("chem_cluster_service/intelligence/cli.py")
        .is_file()
}

fn structured_failure_reason(value: &Value) -> Option<String> {
    value
        .get("code")
        .and_then(Value::as_str)
        .or_else(|| value.get("status").and_then(Value::as_str))
        .map(str::to_string)
}

fn normalized_values(values: Option<&[String]>) -> Option<Vec<String>> {
    let values = values?
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(String::from)
        .collect::<Vec<_>>();
    (!values.is_empty()).then_some(values)
}

fn bounded_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    timeout_ms
        .unwrap_or(DEFAULT_TIMEOUT_MS)
        .clamp(MIN_TIMEOUT_MS, MAX_TIMEOUT_MS)
}

fn wait_child_bounded(
    child: &mut Child,
    timeout: Duration,
) -> Result<Option<ExitStatus>, io::Error> {
    let started_at = Instant::now();
    loop {
        if let Some(status) = child.try_wait()? {
            return Ok(Some(status));
        }
        if started_at.elapsed() >= timeout {
            kill_child(child)?;
            return Ok(None);
        }
        thread::sleep(Duration::from_millis(WAIT_POLL_MS));
    }
}

fn kill_child(child: &mut Child) -> Result<(), io::Error> {
    match child.kill() {
        Ok(()) => {
            let _ = child.wait()?;
            Ok(())
        }
        Err(error) if error.kind() == io::ErrorKind::InvalidInput => {
            let _ = child.wait()?;
            Ok(())
        }
        Err(error) => Err(error),
    }
}

fn tail_lines(bytes: &[u8]) -> Vec<String> {
    let lines = String::from_utf8_lossy(bytes)
        .lines()
        .map(|line| line.chars().take(TAIL_LINE_MAX_CHARS).collect::<String>())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    lines[lines.len().saturating_sub(TAIL_LINE_COUNT)..].to_vec()
}

fn append_capture_tail(buffer: &Arc<Mutex<Vec<u8>>>, chunk: &[u8]) {
    if let Ok(mut captured) = buffer.lock() {
        captured.extend_from_slice(chunk);
        if captured.len() > TAIL_CAPTURE_MAX_BYTES {
            let drain_count = captured.len() - TAIL_CAPTURE_MAX_BYTES;
            captured.drain(..drain_count);
        }
    }
}

fn first_tail_line(lines: &[String]) -> Option<String> {
    lines.first().cloned()
}

fn cleanup_temp_paths(paths: &WorkerTempPaths) {
    let _ = fs::remove_file(&paths.input_path);
    let _ = fs::remove_file(&paths.output_path);
}

impl WorkerTempPaths {
    pub(crate) fn new() -> Self {
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let id = format!("{}-{}-{counter}", std::process::id(), unix_timestamp_ms());
        let root = env::temp_dir();
        Self {
            input_path: root.join(format!(
                "chemd-reaction-intelligence-worker-{id}.input.json"
            )),
            output_path: root.join(format!(
                "chemd-reaction-intelligence-worker-{id}.output.json"
            )),
        }
    }

    #[cfg(test)]
    pub(crate) fn in_dir(dir: &Path) -> Self {
        Self {
            input_path: dir.join("worker-input.json"),
            output_path: dir.join("worker-output.json"),
        }
    }
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

impl PipeCapture {
    fn from_reader<R>(reader: Option<R>) -> Self
    where
        R: Read + Send + 'static,
    {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let Some(mut reader) = reader else {
            return Self {
                buffer,
                handle: None,
            };
        };
        let thread_buffer = Arc::clone(&buffer);
        let handle = thread::spawn(move || {
            let mut chunk = [0_u8; 4096];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(count) => append_capture_tail(&thread_buffer, &chunk[..count]),
                    Err(_) => break,
                }
            }
        });
        Self {
            buffer,
            handle: Some(handle),
        }
    }

    fn collect(&mut self, wait_for_completion: bool) -> Vec<u8> {
        let should_join = wait_for_completion
            || self
                .handle
                .as_ref()
                .map(|handle| handle.is_finished())
                .unwrap_or(false);
        if should_join {
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
        self.buffer
            .lock()
            .map(|captured| captured.clone())
            .unwrap_or_default()
    }
}
