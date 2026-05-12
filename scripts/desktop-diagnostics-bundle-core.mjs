import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import {
  checkDesktopOfflineReleaseSmokePreflight,
  discoverDesktopInstallerArtifacts
} from "./desktop-offline-release-smoke.mjs";
import { checkDesktopRuntimePreconditions } from "./desktop-runtime-smoke.mjs";
import {
  sanitizeDiagnosticValue,
  summarizeEnvSignals
} from "./desktop-diagnostics-sanitizer.mjs";
import { buildDesktopSupportContext } from "./desktop-diagnostics-bundle-support-context.mjs";
import { REPO_ROOT } from "./postgres-tools.mjs";

const execFile = promisify(execFileCallback);

const DESKTOP_PACKAGE_PATH = path.join("apps", "desktop", "package.json");
const DESKTOP_DIST_INDEX_PATH = path.join("apps", "desktop", "dist", "index.html");

export const KNOWN_DESKTOP_COMMAND_NAMES = [
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
  "list_local_outbox",
  "mark_local_outbox_synced",
  "clear_local_outbox_failures",
  "sync_local_outbox_to_postgres",
  "persist_runtime_graph_rag",
  "export_diagnostics_bundle"
];

const readJsonFile = ({ rootDir, relativePath, readTextFile }) =>
  JSON.parse(readTextFile(path.resolve(rootDir, relativePath), "utf8"));

const toRelativePath = ({ rootDir, filePath }) => {
  if (!filePath) {
    return null;
  }
  const relativePath = path.relative(rootDir, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return filePath;
  }
  return relativePath.split(path.sep).join("/");
};

const summarizeFile = ({ rootDir, relativePath, fileExists, statFile }) => {
  const filePath = path.resolve(rootDir, relativePath);
  if (!fileExists(filePath)) {
    return {
      status: "skip",
      path: relativePath.split(path.sep).join("/"),
      reason: "missing"
    };
  }
  try {
    const stat = statFile(filePath);
    return {
      status: Number(stat.size ?? 0) > 0 ? "pass" : "blocked",
      path: relativePath.split(path.sep).join("/"),
      sizeBytes: Number(stat.size ?? 0)
    };
  } catch (error) {
    return {
      status: "skip",
      path: relativePath.split(path.sep).join("/"),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
};

const summarizeArtifact = ({ rootDir, artifact }) => {
  if (!artifact) {
    return { status: "skip", reason: "missing" };
  }
  return {
    status: artifact.size > 0 ? "pass" : "blocked",
    path: toRelativePath({ rootDir, filePath: artifact.path }),
    sizeBytes: artifact.size
  };
};

const summarizeArtifactList = ({ rootDir, artifacts }) => {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { status: "skip", count: 0, items: [] };
  }
  const items = artifacts.map((artifact) => summarizeArtifact({ rootDir, artifact }));
  return {
    status: items.some((item) => item.status === "blocked") ? "blocked" : "pass",
    count: items.length,
    items
  };
};

const summarizeInstallerArtifacts = ({ rootDir, artifactFinder }) => {
  const artifacts = artifactFinder({ rootDir });
  return {
    releaseExe: summarizeArtifact({ rootDir, artifact: artifacts.releaseExe }),
    msiInstallers: summarizeArtifactList({ rootDir, artifacts: artifacts.msiInstallers }),
    nsisInstallers: summarizeArtifactList({ rootDir, artifacts: artifacts.nsisInstallers })
  };
};

const resolveGitCommit = async ({ rootDir, execFileImpl }) => {
  try {
    const { stdout } = await execFileImpl("git", ["rev-parse", "HEAD"], {
      cwd: rootDir,
      timeout: 5_000,
      windowsHide: true
    });
    return { status: "pass", commit: stdout.trim() };
  } catch (error) {
    return {
      status: "skip",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
};

const summarizeDesktopPackage = ({ rootDir, fileExists, readTextFile }) => {
  const packagePath = path.resolve(rootDir, DESKTOP_PACKAGE_PATH);
  if (!fileExists(packagePath)) {
    return {
      status: "skip",
      path: DESKTOP_PACKAGE_PATH.split(path.sep).join("/"),
      reason: "missing"
    };
  }
  try {
    const packageJson = readJsonFile({
      rootDir,
      relativePath: DESKTOP_PACKAGE_PATH,
      readTextFile
    });
    return {
      status: "pass",
      path: DESKTOP_PACKAGE_PATH.split(path.sep).join("/"),
      name: packageJson.name ?? null,
      version: packageJson.version ?? null
    };
  } catch (error) {
    return {
      status: "blocked",
      path: DESKTOP_PACKAGE_PATH.split(path.sep).join("/"),
      reason: error instanceof Error ? error.message : String(error)
    };
  }
};

const sanitizeChecks = ({ rootDir, checks }) =>
  checks.map((check) => ({
    name: check.name,
    status: check.status,
    detail: sanitizeDiagnosticValue(
      typeof check.detail === "string"
        ? check.detail.replaceAll(path.resolve(rootDir), ".")
        : check.detail,
      "detail"
    )
  }));

const summarizeRuntimePreflight = ({ rootDir, desktopCheck }) => {
  const result = desktopCheck({ rootDir });
  return {
    status: result.ok ? "pass" : "blocked",
    checks: sanitizeChecks({ rootDir, checks: result.checks })
  };
};

const summarizeReleasePreflight = async ({ rootDir, releasePreflight }) => {
  try {
    const result = await releasePreflight({ rootDir });
    return {
      status: result.status,
      reason: result.reason,
      detail: result.detail ? sanitizeDiagnosticValue(result.detail, "detail") : null,
      checks: sanitizeChecks({ rootDir, checks: result.checks ?? [] })
    };
  } catch (error) {
    return {
      status: "skip",
      reason: "release-preflight-unavailable",
      detail: error instanceof Error ? error.message : String(error),
      checks: []
    };
  }
};

export const buildDesktopDiagnosticsBundle = async ({
  rootDir = REPO_ROOT,
  env = process.env,
  now = () => new Date(),
  fileExists = existsSync,
  readTextFile = readFileSync,
  statFile = statSync,
  artifactFinder = discoverDesktopInstallerArtifacts,
  desktopCheck = checkDesktopRuntimePreconditions,
  releasePreflight = checkDesktopOfflineReleaseSmokePreflight,
  gitCommitResolver = resolveGitCommit,
  execFileImpl = execFile
} = {}) => {
  const generatedAt = now().toISOString();
  const distIndex = summarizeFile({
    rootDir,
    relativePath: DESKTOP_DIST_INDEX_PATH,
    fileExists,
    statFile
  });
  const runtimePreflight = summarizeRuntimePreflight({ rootDir, desktopCheck });
  const releasePreflightSummary = await summarizeReleasePreflight({ rootDir, releasePreflight });
  const bundle = {
    schemaVersion: 1,
    generatedAt,
    platform: {
      platform: process.platform,
      arch: process.arch,
      release: os.release()
    },
    node: {
      version: process.version
    },
    git: await gitCommitResolver({ rootDir, execFileImpl }),
    desktop: {
      package: summarizeDesktopPackage({ rootDir, fileExists, readTextFile }),
      distIndex,
      releaseArtifacts: summarizeInstallerArtifacts({ rootDir, artifactFinder })
    },
    commands: {
      known: KNOWN_DESKTOP_COMMAND_NAMES
    },
    runtime: {
      preflight: runtimePreflight,
      smoke: {
        status: "skip",
        reason: "not-run-by-diagnostics-bundle",
        detail: "Diagnostics bundle records classifications only; it does not run runtime smoke, GUI, network, or database checks."
      },
      releasePreflight: releasePreflightSummary
    },
    environment: {
      boundary: "Selected process env names only; values are redacted and no .env files are loaded.",
      signals: summarizeEnvSignals(env)
    },
    supportContext: buildDesktopSupportContext({
      rootDir,
      env,
      runtimePreflight,
      releasePreflight: releasePreflightSummary,
      desktopDist: distIndex,
      fileExists,
      readTextFile,
      statFile
    })
  };

  return sanitizeDiagnosticValue(bundle);
};
