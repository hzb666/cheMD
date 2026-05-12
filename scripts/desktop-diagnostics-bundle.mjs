#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  checkDesktopOfflineReleaseSmokePreflight,
  discoverDesktopInstallerArtifacts
} from "./desktop-offline-release-smoke.mjs";
import { checkDesktopRuntimePreconditions } from "./desktop-runtime-smoke.mjs";
import { REPO_ROOT } from "./postgres-tools.mjs";

const execFile = promisify(execFileCallback);

const DESKTOP_PACKAGE_PATH = path.join("apps", "desktop", "package.json");
const DESKTOP_DIST_INDEX_PATH = path.join("apps", "desktop", "dist", "index.html");
const DEFAULT_OUTPUT_DIR = path.join(os.tmpdir(), "chemd-desktop-diagnostics-bundle");
const SENSITIVE_NAME_PATTERN =
  /(?:api[_-]?key|auth|credential|database[_-]?url|db[_-]?url|passwd|password|secret|token|url)$/iu;
const SELECTED_ENV_KEYS = [
  "CHEMD_POSTGRES_DATABASE_URL",
  "DATABASE_URL",
  "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER",
  "CHEMD_DESKTOP_TAURI_COMMAND_RUNNER_ARGS",
  "CHEMD_MANAGED_POSTGRES_BIN_DIR",
  "CHEMD_MANAGED_POSTGRES_RESOURCE_DIR",
  "CHEMD_MANAGED_POSTGRES_HOME",
  "CHEMD_DESKTOP_OFFLINE_SMOKE_DIR"
];

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
  "persist_runtime_graph_rag"
];

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

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

const redactUrlPassword = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.password) {
      parsed.password = "[REDACTED]";
    }
    if (parsed.username && /token|key|secret|password/iu.test(parsed.username)) {
      parsed.username = "[REDACTED]";
    }
    return parsed.toString();
  } catch {
    return value.replace(
      /([?&](?:password|token|api_key|apikey|secret)=)[^&\s]+/giu,
      "$1[REDACTED]"
    );
  }
};

export const redactDiagnosticsValue = (name, value) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (SENSITIVE_NAME_PATTERN.test(String(name))) {
    return "[REDACTED]";
  }
  if (typeof value !== "string") {
    return value;
  }
  return redactUrlPassword(value);
};

export const sanitizeDiagnosticValue = (value, key = "") => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDiagnosticValue(entry, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDiagnosticValue(entryValue, entryKey)
      ])
    );
  }
  return redactDiagnosticsValue(key, value);
};

const summarizeEnvSignals = (env) =>
  SELECTED_ENV_KEYS.map((name) => {
    const value = safeTrim(env[name]);
    return {
      name,
      status: value ? "configured" : "skip",
      value: value ? "[REDACTED]" : null
    };
  });

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
      distIndex: summarizeFile({
        rootDir,
        relativePath: DESKTOP_DIST_INDEX_PATH,
        fileExists,
        statFile
      }),
      releaseArtifacts: summarizeInstallerArtifacts({ rootDir, artifactFinder })
    },
    commands: {
      known: KNOWN_DESKTOP_COMMAND_NAMES
    },
    runtime: {
      preflight: summarizeRuntimePreflight({ rootDir, desktopCheck }),
      smoke: {
        status: "skip",
        reason: "not-run-by-diagnostics-bundle",
        detail: "Diagnostics bundle records classifications only; it does not run runtime smoke, GUI, network, or database checks."
      },
      releasePreflight: await summarizeReleasePreflight({ rootDir, releasePreflight })
    },
    environment: {
      boundary: "Selected process env names only; values are redacted and no .env files are loaded.",
      signals: summarizeEnvSignals(env)
    }
  };

  return sanitizeDiagnosticValue(bundle);
};

const defaultOutputPath = ({ generatedAt = new Date().toISOString() } = {}) => {
  const safeTimestamp = generatedAt.replaceAll(":", "-").replaceAll(".", "-");
  return path.join(DEFAULT_OUTPUT_DIR, `chemd-desktop-diagnostics-${safeTimestamp}.json`);
};

const parseArgs = (argv) => {
  const args = [...argv];
  const parsed = { outputPath: "" };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--output") {
      const outputPath = args.shift();
      if (!outputPath) {
        throw new Error("--output requires a path");
      }
      parsed.outputPath = outputPath;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
};

const helpText = () => [
  "Usage: pnpm desktop:diagnostics-bundle [--output <path>]",
  "",
  "Writes a redacted desktop diagnostics JSON bundle without starting GUI,",
  "opening network connections, loading .env files, or running heavy smoke tests.",
  "Use --output - to print JSON to stdout."
].join("\n");

export const runDesktopDiagnosticsBundle = async ({
  outputPath,
  bundleBuilder = buildDesktopDiagnosticsBundle,
  makeDir = mkdirSync,
  writeTextFile = writeFileSync
} = {}) => {
  const bundle = await bundleBuilder();
  const targetPath = outputPath || defaultOutputPath({ generatedAt: bundle.generatedAt });
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  if (targetPath === "-") {
    return { outputPath: "-", json, bundle };
  }
  makeDir(path.dirname(targetPath), { recursive: true });
  writeTextFile(targetPath, json, "utf8");
  return { outputPath: targetPath, json, bundle };
};

export const runDesktopDiagnosticsBundleCli = async ({
  argv = process.argv.slice(2),
  logger = console,
  runner = runDesktopDiagnosticsBundle,
  runOptions = {}
} = {}) => {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      logger.log(helpText());
      return 0;
    }
    const result = await runner({ ...runOptions, outputPath: args.outputPath });
    if (result.outputPath === "-") {
      logger.log(result.json.trimEnd());
    } else {
      logger.log(`Desktop diagnostics bundle written: ${result.outputPath}`);
    }
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopDiagnosticsBundleCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
