#![cfg_attr(test, allow(dead_code))]

use crate::workspace::DesktopCommandError;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const SCHEMA_VERSION: u8 = 1;
const DEFAULT_OUTPUT_DIR: &str = "chemd-desktop-diagnostics-bundle";
const SKIP: &str = "SKIP";

const KNOWN_TAURI_COMMANDS: [&str; 25] = [
    "open_workspace",
    "list_workspace_files",
    "read_workspace_file",
    "write_workspace_file",
    "start_sidecar",
    "stop_sidecar",
    "read_sidecar_status",
    "read_sidecar_logs",
    "read_postgres_status",
    "read_managed_postgres_status",
    "initialize_managed_postgres",
    "start_managed_postgres",
    "stop_managed_postgres",
    "migrate_managed_postgres",
    "read_local_store_status",
    "save_local_runtime_snapshot",
    "save_local_reaction_intelligence_artifact",
    "list_local_reaction_intelligence_artifacts",
    "list_local_outbox",
    "mark_local_outbox_synced",
    "clear_local_outbox_failures",
    "sync_local_outbox_to_postgres",
    "persist_runtime_graph_rag",
    "run_reaction_intelligence_worker",
    "export_diagnostics_bundle",
];

const SUPPORT_COMMANDS: [SupportCommand; 4] = [
    SupportCommand {
        name: "diagnostics bundle",
        command: "pnpm desktop:diagnostics-bundle",
        boundary:
            "offline JSON bundle only; does not start GUI, network, database, or config loading",
    },
    SupportCommand {
        name: "offline core smoke",
        command: "pnpm desktop:offline-core-smoke",
        boundary: "local snapshot and outbox smoke; database persistence remains skipped",
    },
    SupportCommand {
        name: "runtime smoke",
        command: "pnpm desktop:runtime-smoke",
        boundary:
            "script-level runtime proof; may skip database or Tauri command proof by environment",
    },
    SupportCommand {
        name: "release artifact preflight",
        command: "pnpm desktop:offline-release-smoke",
        boundary: "artifact and process-lock classification; not clean-machine installer proof",
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsBundleExportResult {
    state: String,
    label: String,
    detail: String,
    pub(crate) output_path: String,
    summary: DiagnosticsBundleSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsBundleSummary {
    generated_at: String,
    command_count: usize,
    boundary_skip_count: usize,
    support_command_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticsBundle {
    schema_version: u8,
    generated_at: String,
    platform: PlatformInfo,
    package: PackageInfo,
    known_tauri_commands: Vec<String>,
    local_support_commands: Vec<SupportCommand>,
    runtime_boundaries: Vec<RuntimeBoundary>,
    summary: DiagnosticsBundleSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: String,
    arch: String,
    family: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PackageInfo {
    name: String,
    version: String,
    app_version: String,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct SupportCommand {
    name: &'static str,
    command: &'static str,
    boundary: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeBoundary {
    name: &'static str,
    status: &'static str,
    reason: &'static str,
}

#[cfg(not(test))]
#[tauri::command]
pub fn export_diagnostics_bundle() -> Result<DiagnosticsBundleExportResult, DesktopCommandError> {
    export_bundle_impl()
}

pub(crate) fn export_bundle_impl() -> Result<DiagnosticsBundleExportResult, DesktopCommandError> {
    export_diagnostics_bundle_to_dir(default_output_dir())
}

pub(crate) fn export_diagnostics_bundle_to_dir(
    output_dir: PathBuf,
) -> Result<DiagnosticsBundleExportResult, DesktopCommandError> {
    let generated_at = unix_timestamp_ms();
    let bundle = build_bundle(generated_at);
    let output_path = output_dir.join(file_name(&bundle.generated_at));
    write_bundle(&output_path, &bundle)?;
    Ok(export_result(output_path, bundle.summary))
}

fn build_bundle(generated_at: String) -> DiagnosticsBundle {
    let boundaries = runtime_boundaries();
    let summary = DiagnosticsBundleSummary {
        generated_at: generated_at.clone(),
        command_count: KNOWN_TAURI_COMMANDS.len(),
        boundary_skip_count: boundaries.len(),
        support_command_count: SUPPORT_COMMANDS.len(),
    };
    DiagnosticsBundle {
        schema_version: SCHEMA_VERSION,
        generated_at,
        platform: platform_info(),
        package: package_info(),
        known_tauri_commands: command_names(),
        local_support_commands: SUPPORT_COMMANDS.to_vec(),
        runtime_boundaries: boundaries,
        summary,
    }
}

fn default_output_dir() -> PathBuf {
    std::env::temp_dir().join(DEFAULT_OUTPUT_DIR)
}

fn write_bundle(path: &Path, bundle: &DiagnosticsBundle) -> Result<(), DesktopCommandError> {
    let json = serde_json::to_string_pretty(bundle).map_err(|error| {
        DesktopCommandError::new(
            "diagnostics_bundle_serialize_failed",
            "Failed to serialize diagnostics bundle",
            Some(error.to_string()),
        )
    })?;
    let parent = path.parent().ok_or_else(|| {
        DesktopCommandError::new(
            "diagnostics_bundle_path_invalid",
            "Diagnostics bundle output path is invalid",
            None,
        )
    })?;
    fs::create_dir_all(parent).map_err(|error| {
        DesktopCommandError::io(
            "diagnostics_bundle_directory_failed",
            "Failed to create diagnostics bundle directory",
            error,
        )
    })?;
    fs::write(path, format!("{json}\n")).map_err(|error| {
        DesktopCommandError::io(
            "diagnostics_bundle_write_failed",
            "Failed to write diagnostics bundle",
            error,
        )
    })
}

fn export_result(
    path: PathBuf,
    summary: DiagnosticsBundleSummary,
) -> DiagnosticsBundleExportResult {
    DiagnosticsBundleExportResult {
        state: "ready".into(),
        label: "Diagnostics bundle exported".into(),
        detail: "Wrote an offline redacted diagnostics JSON bundle".into(),
        output_path: path.to_string_lossy().into_owned(),
        summary,
    }
}

fn command_names() -> Vec<String> {
    KNOWN_TAURI_COMMANDS
        .iter()
        .map(|name| (*name).into())
        .collect()
}

fn runtime_boundaries() -> Vec<RuntimeBoundary> {
    vec![
        RuntimeBoundary {
            name: "sidecar",
            status: SKIP,
            reason: "not-run-by-diagnostics-bundle",
        },
        RuntimeBoundary {
            name: "logs",
            status: SKIP,
            reason: "no arbitrary log files are read",
        },
        RuntimeBoundary {
            name: "postgres",
            status: SKIP,
            reason: "database checks are not executed",
        },
        RuntimeBoundary {
            name: "provider",
            status: SKIP,
            reason: "network providers are not contacted",
        },
        RuntimeBoundary {
            name: "tauriCommandSmoke",
            status: SKIP,
            reason: "GUI and command runner are not started",
        },
    ]
}

fn platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        family: std::env::consts::FAMILY.into(),
    }
}

fn package_info() -> PackageInfo {
    let version = env!("CARGO_PKG_VERSION").to_string();
    PackageInfo {
        name: env!("CARGO_PKG_NAME").into(),
        version: version.clone(),
        app_version: version,
    }
}

fn file_name(generated_at: &str) -> String {
    format!("chemd-desktop-diagnostics-{generated_at}.json")
}

fn unix_timestamp_ms() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}
