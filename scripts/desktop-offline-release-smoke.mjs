#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
const REQUIRED_DESKTOP_SCRIPTS = ["build", "typecheck", "tauri:build"];

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

const findReleaseExeLocks = ({ processes, releaseExePath }) =>
  processes.filter((row) => isSamePath(row.executablePath, releaseExePath));

export const checkDesktopOfflineReleaseSmokePreflight = async ({
  rootDir = REPO_ROOT,
  fileExists = existsSync,
  readTextFile = readFileSync,
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

  const processResult = await processLister({ rootDir, releaseExePath });
  if (processResult.status !== "skipped") {
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

    if (blockingProcesses.length > 0) {
      return {
        status: "blocked",
        reason: "release-exe-running",
        releaseExePath,
        checks,
        blockingProcesses
      };
    }
  } else {
    addCheck(checks, "release exe lock", "skip", processResult.reason);
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

  if (processResult.status === "skipped") {
    return {
      status: "skipped",
      reason: "process-inspection-unavailable",
      detail: processResult.reason,
      releaseExePath,
      checks,
      blockingProcesses: []
    };
  }

  return {
    status: "passed",
    reason: "release-offline-smoke-preflight-ready",
    releaseExePath,
    checks,
    blockingProcesses: []
  };
};

const logPreflightResult = ({ logger, result }) => {
  logger.log("Chemd desktop release Offline Core smoke preflight.");
  for (const check of result.checks) {
    logger.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }

  if (result.status === "passed") {
    logger.log("PASS release Offline Core smoke preflight.");
    logger.log("Next: run pnpm --filter @chemd/desktop tauri:build, then installer Offline Core smoke.");
    return;
  }

  if (result.status === "blocked") {
    logger.log(`BLOCKED release Offline Core smoke preflight: ${result.reason}.`);
    if (result.reason === "release-exe-running") {
      logger.log(`Release exe path: ${result.releaseExePath}`);
      logger.log("Close the listed Chemd Desktop process, or retry with an isolated CARGO_TARGET_DIR.");
    }
    return;
  }

  logger.log(`SKIP release Offline Core smoke preflight: ${result.reason}.`);
  if (result.detail) {
    logger.log(result.detail);
  }
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
