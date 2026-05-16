#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { REPO_ROOT } from "./postgres-tools.mjs";

const execFile = promisify(execFileCallback);

const DESKTOP_PACKAGE_PATH = path.join("apps", "desktop", "package.json");
const DESKTOP_DIST_INDEX_PATH = path.join("apps", "desktop", "dist", "index.html");
const RELEASE_EXE_PATH = path.join(
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "release",
  "chemd-desktop.exe"
);
const RELEASE_BUNDLE_DIR = path.join("apps", "desktop", "src-tauri", "target", "release", "bundle");
const MSI_BUNDLE_DIR = path.join(RELEASE_BUNDLE_DIR, "msi");
const NSIS_BUNDLE_DIR = path.join(RELEASE_BUNDLE_DIR, "nsis");
const REQUIRED_DESKTOP_SCRIPTS = ["build", "typecheck", "tauri:build"];
const INSTALLER_ARTIFACT_CHECKS = [
  {
    name: "release exe artifact",
    key: "releaseExe",
    missing: `${RELEASE_EXE_PATH} missing; run pnpm --filter @chemd/desktop tauri:build first`
  },
  {
    name: "MSI installer artifact",
    key: "msiInstallers",
    missing: `${MSI_BUNDLE_DIR} has no .msi installer; run pnpm --filter @chemd/desktop tauri:build first`
  },
  {
    name: "NSIS installer artifact",
    key: "nsisInstallers",
    missing: `${NSIS_BUNDLE_DIR} has no .exe installer; run pnpm --filter @chemd/desktop tauri:build first`
  }
];

const readJsonFile = ({ rootDir, relativePath, readTextFile }) =>
  JSON.parse(readTextFile(path.resolve(rootDir, relativePath), "utf8"));

const addCheck = (checks, name, status, detail) => {
  checks.push({ name, status, detail });
};

const normalizePathForCompare = (filePath) => {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return "";
  }

  const normalized = path.resolve(filePath.trim()).replaceAll("/", "\\");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
};

const isSamePath = (left, right) =>
  normalizePathForCompare(left) === normalizePathForCompare(right);

const statArtifact = (filePath, statFile) => {
  try {
    const stat = statFile(filePath);
    if (typeof stat.isFile === "function" && !stat.isFile()) {
      return undefined;
    }
    return { path: filePath, size: Number(stat.size ?? 0) };
  } catch {
    return undefined;
  }
};

const findBundleArtifacts = ({ rootDir, relativeDir, extension, readDir, statFile }) => {
  const directoryPath = path.resolve(rootDir, relativeDir);
  let entries;
  try {
    entries = readDir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => statArtifact(path.join(directoryPath, entry.name), statFile))
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path));
};

export const discoverDesktopInstallerArtifacts = ({
  rootDir = REPO_ROOT,
  readDir = readdirSync,
  statFile = statSync
} = {}) => ({
  releaseExe: statArtifact(path.resolve(rootDir, RELEASE_EXE_PATH), statFile),
  msiInstallers: findBundleArtifacts({ rootDir, relativeDir: MSI_BUNDLE_DIR, extension: ".msi", readDir, statFile }),
  nsisInstallers: findBundleArtifacts({ rootDir, relativeDir: NSIS_BUNDLE_DIR, extension: ".exe", readDir, statFile })
});

const normalizeProcessRows = (raw) => {
  if (!raw || /^\s*null\s*$/u.test(raw)) {
    return [];
  }

  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows
    .map((row) => ({
      pid: Number(row.ProcessId ?? row.PID ?? row.pid),
      executablePath: String(row.ExecutablePath ?? row.Path ?? row.path ?? "")
    }))
    .filter((row) => Number.isFinite(row.pid));
};

export const listWindowsChemdDesktopProcesses = async ({
  execFileImpl = execFile
} = {}) => {
  if (process.platform !== "win32") {
    return { status: "skipped", processes: [], reason: "release exe lock detection is Windows-only" };
  }

  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Get-CimInstance Win32_Process -Filter \"Name = 'chemd-desktop.exe'\"",
    "| Select-Object ProcessId,ExecutablePath",
    "| ConvertTo-Json -Compress"
  ].join(" ");

  try {
    const { stdout } = await execFileImpl(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
      { timeout: 10_000, windowsHide: true }
    );
    return { status: "passed", processes: normalizeProcessRows(stdout) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "skipped",
      processes: [],
      reason: `release exe process inspection unavailable: ${message}`
    };
  }
};

const checkDesktopScripts = ({ checks, rootDir, fileExists, readTextFile }) => {
  const packagePath = path.resolve(rootDir, DESKTOP_PACKAGE_PATH);
  if (!fileExists(packagePath)) {
    addCheck(checks, "desktop scripts", "blocked", `${DESKTOP_PACKAGE_PATH} missing`);
    return false;
  }

  const packageJson = readJsonFile({ rootDir, relativePath: DESKTOP_PACKAGE_PATH, readTextFile });
  const missing = REQUIRED_DESKTOP_SCRIPTS.filter((scriptName) => !packageJson.scripts?.[scriptName]);
  addCheck(
    checks,
    "desktop scripts",
    missing.length === 0 ? "pass" : "blocked",
    missing.length === 0 ? "build/typecheck/tauri:build available" : `missing ${missing.join(", ")}`
  );
  return missing.length === 0;
};

const checkDesktopDist = ({ checks, rootDir, fileExists }) => {
  const distPath = path.resolve(rootDir, DESKTOP_DIST_INDEX_PATH);
  const available = fileExists(distPath);
  addCheck(
    checks,
    "desktop dist",
    available ? "pass" : "skip",
    available ? DESKTOP_DIST_INDEX_PATH : `${DESKTOP_DIST_INDEX_PATH} missing; run pnpm --filter @chemd/desktop build first`
  );
  return available;
};

const addArtifactCheck = ({ checks, name, artifacts, missingDetail }) => {
  if (artifacts.length === 0) {
    addCheck(checks, name, "skip", missingDetail);
    return "skipped";
  }

  const emptyArtifacts = artifacts.filter((artifact) => artifact.size <= 0);
  if (emptyArtifacts.length > 0) {
    addCheck(
      checks,
      name,
      "blocked",
      `empty artifact(s): ${emptyArtifacts.map((artifact) => artifact.path).join(", ")}`
    );
    return "blocked";
  }

  addCheck(checks, name, "pass", artifacts.map((artifact) => `${artifact.path} (${artifact.size} bytes)`).join("; "));
  return "passed";
};

const checkInstallerArtifacts = ({ checks, rootDir, artifactFinder }) => {
  const artifacts = artifactFinder({ rootDir });
  const statuses = INSTALLER_ARTIFACT_CHECKS.map((check) =>
    addArtifactCheck({
      checks,
      name: check.name,
      artifacts: Array.isArray(artifacts[check.key]) ? artifacts[check.key] : [artifacts[check.key]].filter(Boolean),
      missingDetail: check.missing
    })
  );

  if (statuses.includes("blocked")) {
    return { status: "blocked", reason: "release-artifact-empty" };
  }
  if (statuses.includes("skipped")) {
    return { status: "skipped", reason: "release-artifacts-missing" };
  }

  return { status: "passed", reason: "installer-artifacts-ready" };
};

const findReleaseExeLocks = ({ processes, releaseExePath }) =>
  processes.filter((row) => isSamePath(row.executablePath, releaseExePath));

const inspectReleaseExeLocks = async ({
  checks,
  processLister,
  releaseExePath,
  rootDir
}) => {
  const processResult = await processLister({ rootDir, releaseExePath });
  if (processResult.status === "skipped") {
    addCheck(checks, "release exe lock", "skip", processResult.reason);
    return {
      status: "skipped",
      detail: processResult.reason,
      blockingProcesses: []
    };
  }

  const blockingProcesses = findReleaseExeLocks({
    processes: processResult.processes,
    releaseExePath
  });
  addCheck(
    checks,
    "release exe lock",
    blockingProcesses.length === 0 ? "pass" : "blocked",
    blockingProcesses.length === 0
      ? `${RELEASE_EXE_PATH} is not running`
      : blockingProcesses
          .map((row) => `PID ${row.pid}: ${row.executablePath || "(path unavailable)"}`)
          .join("; ")
  );

  return {
    status: blockingProcesses.length === 0 ? "passed" : "blocked",
    blockingProcesses
  };
};

export const checkDesktopOfflineReleaseSmokePreflight = async ({
  rootDir = REPO_ROOT,
  fileExists = existsSync,
  readTextFile = readFileSync,
  artifactFinder = discoverDesktopInstallerArtifacts,
  processLister = listWindowsChemdDesktopProcesses
} = {}) => {
  const checks = [];
  const releaseExePath = path.resolve(rootDir, RELEASE_EXE_PATH);

  const hasScripts = checkDesktopScripts({ checks, rootDir, fileExists, readTextFile });
  const hasDist = checkDesktopDist({ checks, rootDir, fileExists });
  if (!hasScripts) {
    return {
      status: "blocked",
      reason: "desktop-scripts-missing",
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  const lockResult = await inspectReleaseExeLocks({
    checks,
    processLister,
    releaseExePath,
    rootDir
  });
  if (lockResult.status === "blocked") {
    return {
      status: "blocked",
      reason: "release-exe-running",
      releaseExePath,
      checks,
      blockingProcesses: lockResult.blockingProcesses
    };
  }

  const artifactResult = checkInstallerArtifacts({ checks, rootDir, artifactFinder });
  if (artifactResult.status === "blocked") {
    return {
      status: "blocked",
      reason: artifactResult.reason,
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  if (!hasDist) {
    return {
      status: "skipped",
      reason: "desktop-dist-missing",
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  if (artifactResult.status === "skipped") {
    return {
      status: "skipped",
      reason: artifactResult.reason,
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  if (lockResult.status === "skipped") {
    return {
      status: "skipped",
      reason: "process-inspection-unavailable",
      detail: lockResult.detail,
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  return {
    status: "passed",
    reason: "installer-offline-smoke-artifact-preflight-ready",
    releaseExePath,
    checks,
    blockingProcesses: []
  };
};

const logPreflightResult = ({ logger, result }) => {
  logger.log("Chemd desktop installer Offline Core smoke artifact preflight.");
  for (const check of result.checks) {
    logger.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }

  if (result.status === "passed") {
    logger.log("PASS installer Offline Core artifact preflight.");
    logger.log("Boundary: this does not install the app or prove clean-machine Offline Core behavior.");
    return;
  }

  if (result.status === "blocked") {
    logger.log(`BLOCKED installer Offline Core artifact preflight: ${result.reason}.`);
    if (result.reason === "release-exe-running") {
      logger.log(`Release exe path: ${result.releaseExePath}`);
      logger.log("Close the listed Chemd Desktop process, or retry with an isolated CARGO_TARGET_DIR.");
    }
    return;
  }

  logger.log(`SKIP installer Offline Core artifact preflight: ${result.reason}.`);
  if (result.detail) {
    logger.log(result.detail);
  }
  logger.log("Boundary: missing artifacts or process inspection gaps are not clean-machine smoke results.");
};

export const runDesktopOfflineReleaseSmokePreflight = async (options = {}) => {
  const result = await checkDesktopOfflineReleaseSmokePreflight(options);
  logPreflightResult({ logger: options.logger ?? console, result });
  return result;
};

export const runDesktopOfflineReleaseSmokePreflightCli = async ({
  runner = runDesktopOfflineReleaseSmokePreflight,
  logger = console
} = {}) => {
  try {
    const result = await runner({ logger });
    return result.status === "blocked" ? 2 : 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopOfflineReleaseSmokePreflightCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
