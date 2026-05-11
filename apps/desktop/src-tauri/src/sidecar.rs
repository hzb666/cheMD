use crate::{
    sidecar_command::{default_sidecar_command_spec, SidecarCommandSpec},
    sidecar_log::{spawn_log_reader, LogTail, SharedLogTail},
    workspace::DesktopCommandError,
};
use serde::Serialize;
use std::{
    process::{Child, Command, ExitStatus, Stdio},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
pub struct SidecarManager {
    inner: Mutex<SidecarState>,
}

#[derive(Default)]
struct SidecarState {
    process: Option<ManagedSidecar>,
    last_status: Option<SidecarStatus>,
}

struct ManagedSidecar {
    child: Child,
    pid: u32,
    started_at: String,
    command_label: String,
    logs: SharedLogTail,
}

impl Drop for ManagedSidecar {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    state: String,
    label: String,
    detail: String,
    pid: Option<u32>,
    started_at: Option<String>,
    log_tail: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarLogs {
    lines: Vec<String>,
}

impl SidecarManager {
    #[cfg_attr(test, allow(dead_code))]
    pub(crate) fn start(&self) -> Result<SidecarStatus, DesktopCommandError> {
        let spec = default_sidecar_command_spec()?;
        self.start_with_spec(spec)
    }

    pub(crate) fn start_with_spec(
        &self,
        spec: SidecarCommandSpec,
    ) -> Result<SidecarStatus, DesktopCommandError> {
        let mut state = self.lock_state()?;
        if let Some(status) = running_status_if_alive(&mut state)? {
            return Ok(status);
        }

        let mut command = Command::new(&spec.program);
        command
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = command.spawn().map_err(|err| {
            DesktopCommandError::io(
                "sidecar_spawn_failed",
                "Failed to start chem-service sidecar",
                err,
            )
        })?;
        let logs = LogTail::default_shared();
        if let Some(stdout) = child.stdout.take() {
            spawn_log_reader("stdout", stdout, logs.clone());
        }
        if let Some(stderr) = child.stderr.take() {
            spawn_log_reader("stderr", stderr, logs.clone());
        }

        let managed = ManagedSidecar {
            pid: child.id(),
            child,
            started_at: unix_timestamp_ms(),
            command_label: spec.label,
            logs,
        };
        let status = running_status(&managed, "chem-service sidecar running");
        state.process = Some(managed);
        state.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn stop(&self) -> Result<SidecarStatus, DesktopCommandError> {
        let mut state = self.lock_state()?;
        let Some(mut managed) = state.process.take() else {
            let status = offline_status("chem-service sidecar is not running", Vec::new());
            state.last_status = Some(status.clone());
            return Ok(status);
        };

        if let Some(exit) = try_wait(&mut managed)? {
            let status = exited_status(&managed, exit);
            state.last_status = Some(status.clone());
            return Ok(status);
        }

        managed.child.kill().map_err(|err| {
            DesktopCommandError::io(
                "sidecar_stop_failed",
                "Failed to stop chem-service sidecar",
                err,
            )
        })?;
        managed.child.wait().map_err(|err| {
            DesktopCommandError::io(
                "sidecar_wait_failed",
                "Failed to wait for chem-service sidecar shutdown",
                err,
            )
        })?;

        let status = SidecarStatus {
            state: "offline".into(),
            label: "Sidecar stopped".into(),
            detail: "Stopped chem-service process started by this app".into(),
            pid: None,
            started_at: Some(managed.started_at.clone()),
            log_tail: log_lines(&managed.logs),
        };
        state.last_status = Some(status.clone());
        Ok(status)
    }

    pub(crate) fn status(&self) -> Result<SidecarStatus, DesktopCommandError> {
        let mut state = self.lock_state()?;
        if let Some(managed) = state.process.as_mut() {
            if let Some(exit) = try_wait(managed)? {
                let status = exited_status(managed, exit);
                state.process = None;
                state.last_status = Some(status.clone());
                return Ok(status);
            }
            let status = running_status(managed, "chem-service sidecar running");
            state.last_status = Some(status.clone());
            return Ok(status);
        }

        Ok(state
            .last_status
            .clone()
            .unwrap_or_else(|| offline_status("chem-service sidecar has not been started", vec![])))
    }

    pub(crate) fn logs(&self) -> Result<SidecarLogs, DesktopCommandError> {
        let state = self.lock_state()?;
        let lines = state
            .process
            .as_ref()
            .map(|process| log_lines(&process.logs))
            .or_else(|| {
                state
                    .last_status
                    .as_ref()
                    .map(|status| status.log_tail.clone())
            })
            .unwrap_or_default();
        Ok(SidecarLogs { lines })
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, SidecarState>, DesktopCommandError> {
        self.inner.lock().map_err(|_| {
            DesktopCommandError::new(
                "sidecar_state_unavailable",
                "Sidecar state is unavailable",
                None,
            )
        })
    }
}

#[cfg(not(test))]
#[tauri::command]
pub fn start_sidecar(
    manager: tauri::State<'_, SidecarManager>,
) -> Result<SidecarStatus, DesktopCommandError> {
    manager.start()
}

#[cfg(not(test))]
#[tauri::command]
pub fn stop_sidecar(
    manager: tauri::State<'_, SidecarManager>,
) -> Result<SidecarStatus, DesktopCommandError> {
    manager.stop()
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_sidecar_status(
    manager: tauri::State<'_, SidecarManager>,
) -> Result<SidecarStatus, DesktopCommandError> {
    manager.status()
}

#[cfg(not(test))]
#[tauri::command]
pub fn read_sidecar_logs(
    manager: tauri::State<'_, SidecarManager>,
) -> Result<SidecarLogs, DesktopCommandError> {
    manager.logs()
}

fn running_status_if_alive(
    state: &mut SidecarState,
) -> Result<Option<SidecarStatus>, DesktopCommandError> {
    let Some(managed) = state.process.as_mut() else {
        return Ok(None);
    };
    if let Some(exit) = try_wait(managed)? {
        let status = exited_status(managed, exit);
        state.process = None;
        state.last_status = Some(status);
        return Ok(None);
    }
    Ok(Some(running_status(
        managed,
        "chem-service sidecar already running",
    )))
}

fn running_status(managed: &ManagedSidecar, detail: &str) -> SidecarStatus {
    SidecarStatus {
        state: "ready".into(),
        label: "Sidecar running".into(),
        detail: format!("{detail} via {}", managed.command_label),
        pid: Some(managed.pid),
        started_at: Some(managed.started_at.clone()),
        log_tail: log_lines(&managed.logs),
    }
}

fn exited_status(managed: &ManagedSidecar, exit: ExitStatus) -> SidecarStatus {
    SidecarStatus {
        state: "degraded".into(),
        label: "Sidecar exited".into(),
        detail: format!("chem-service exited with status {exit}"),
        pid: None,
        started_at: Some(managed.started_at.clone()),
        log_tail: log_lines(&managed.logs),
    }
}

fn offline_status(detail: &str, log_tail: Vec<String>) -> SidecarStatus {
    SidecarStatus {
        state: "offline".into(),
        label: "Sidecar offline".into(),
        detail: detail.into(),
        pid: None,
        started_at: None,
        log_tail,
    }
}

fn try_wait(managed: &mut ManagedSidecar) -> Result<Option<ExitStatus>, DesktopCommandError> {
    managed.child.try_wait().map_err(|err| {
        DesktopCommandError::io(
            "sidecar_status_failed",
            "Failed to inspect chem-service sidecar status",
            err,
        )
    })
}

fn log_lines(logs: &SharedLogTail) -> Vec<String> {
    logs.lock().map(|tail| tail.lines()).unwrap_or_default()
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
