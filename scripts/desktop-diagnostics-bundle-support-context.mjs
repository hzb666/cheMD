import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { sanitizeDiagnosticValue } from "./desktop-diagnostics-sanitizer.mjs";

const OFFLINE_SMOKE_DIR_ENV = "CHEMD_DESKTOP_OFFLINE_SMOKE_DIR";
const MAX_SUMMARY_BYTES = 64 * 1024;
const OFFLINE_SMOKE_FILES = [
  { key: "runtimeSnapshot", fileName: "runtime-snapshot.json", summarize: summarizeRuntimeSnapshot },
  { key: "outbox", fileName: "outbox.json", summarize: summarizeOutbox }
];

export const SUPPORT_COMMANDS = [
  {
    name: "diagnostics bundle",
    command: "pnpm desktop:diagnostics-bundle",
    boundary: "offline JSON bundle only; does not start GUI, network, database, or .env loading"
  },
  {
    name: "offline core smoke",
    command: "pnpm desktop:offline-core-smoke",
    boundary: "local snapshot and outbox smoke; database persistence remains skipped"
  },
  {
    name: "runtime smoke",
    command: "pnpm desktop:runtime-smoke",
    boundary: "script-level runtime proof; may SKIP database or Tauri command proof by environment"
  },
  {
    name: "release artifact preflight",
    command: "pnpm desktop:offline-release-smoke",
    boundary: "artifact and process-lock classification; not clean-machine installer proof"
  }
];

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

const supportPath = ({ rootDir, filePath }) => {
  const relativePath = path.relative(rootDir, filePath);
  if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }
  return "[external-path-redacted]";
};

const statSummary = ({ filePath, statFile }) => {
  const stat = statFile(filePath);
  return {
    sizeBytes: Number(stat.size ?? 0),
    isDirectory: typeof stat.isDirectory === "function" ? stat.isDirectory() : false
  };
};

const statusBucket = (value) => {
  const normalized = safeTrim(value).toLowerCase();
  if (["pending", "synced", "failed", "skipped"].includes(normalized)) {
    return normalized;
  }
  return "other";
};

function summarizeRuntimeSnapshot(value) {
  const metadata = value?.metadata && typeof value.metadata === "object" ? value.metadata : {};
  return {
    savedAt: typeof value?.savedAt === "string" ? value.savedAt : null,
    payload: value?.payload && typeof value.payload === "object" ? "present" : "missing",
    metadataKeys: Object.keys(metadata).sort().slice(0, 20)
  };
}

function summarizeOutbox(value) {
  const entries = Array.isArray(value?.entries) ? value.entries : [];
  const statusCounts = { pending: 0, synced: 0, failed: 0, skipped: 0, other: 0 };
  for (const entry of entries) {
    statusCounts[statusBucket(entry?.syncStatus)] += 1;
  }
  return { entryCount: entries.length, statusCounts };
}

const summarizeKnownFile = ({ rootDir, directoryPath, descriptor, fileExists, readTextFile, statFile }) => {
  const filePath = path.join(directoryPath, descriptor.fileName);
  const displayPath = supportPath({ rootDir, filePath });
  if (!fileExists(filePath)) {
    return { status: "skip", path: displayPath, reason: "missing" };
  }

  try {
    const stat = statSummary({ filePath, statFile });
    if (stat.sizeBytes > MAX_SUMMARY_BYTES) {
      return { status: "skip", path: displayPath, reason: "file-too-large", sizeBytes: stat.sizeBytes };
    }
    const parsed = JSON.parse(readTextFile(filePath, "utf8"));
    return {
      status: "pass",
      path: displayPath,
      sizeBytes: stat.sizeBytes,
      summary: descriptor.summarize(parsed)
    };
  } catch (error) {
    return {
      status: "blocked",
      path: displayPath,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
};

const summarizeOfflineSmokeDirectory = ({ rootDir, env, fileExists, readTextFile, statFile }) => {
  const configuredPath = safeTrim(env[OFFLINE_SMOKE_DIR_ENV]);
  if (!configuredPath) {
    return { status: "skip", envName: OFFLINE_SMOKE_DIR_ENV, reason: "not-configured", files: {} };
  }

  const directoryPath = path.resolve(rootDir, configuredPath);
  const displayPath = supportPath({ rootDir, filePath: directoryPath });
  if (!fileExists(directoryPath)) {
    return { status: "skip", envName: OFFLINE_SMOKE_DIR_ENV, path: displayPath, reason: "missing", files: {} };
  }

  const stat = statSummary({ filePath: directoryPath, statFile });
  if (!stat.isDirectory) {
    return { status: "blocked", envName: OFFLINE_SMOKE_DIR_ENV, path: displayPath, reason: "not-directory", files: {} };
  }

  const entries = OFFLINE_SMOKE_FILES.map((descriptor) => [
    descriptor.key,
    summarizeKnownFile({ rootDir, directoryPath, descriptor, fileExists, readTextFile, statFile })
  ]);
  return { status: "pass", envName: OFFLINE_SMOKE_DIR_ENV, path: displayPath, files: Object.fromEntries(entries) };
};

const classifyStatus = (value) => {
  const status = safeTrim(value).toLowerCase();
  if (["pass", "passed", "configured"].includes(status)) {
    return "ready";
  }
  if (["blocked", "fail", "failed"].includes(status)) {
    return "blocked";
  }
  if (["skip", "skipped", "unavailable"].includes(status)) {
    return "skip";
  }
  return "unknown";
};

export const buildDesktopSupportContext = ({
  rootDir,
  env,
  runtimePreflight,
  releasePreflight,
  desktopDist,
  fileExists = existsSync,
  readTextFile = readFileSync,
  statFile = statSync
}) =>
  sanitizeDiagnosticValue({
    boundary: "Support context is offline-only and redacted; it never reads .env files, starts GUI, opens network, or runs services.",
    offlineSmoke: summarizeOfflineSmokeDirectory({ rootDir, env, fileExists, readTextFile, statFile }),
    supportCommands: SUPPORT_COMMANDS,
    classifications: {
      desktopDist: classifyStatus(desktopDist?.status),
      runtimePreflight: classifyStatus(runtimePreflight?.status),
      releasePreflight: classifyStatus(releasePreflight?.status)
    },
    notRun: [
      { name: "sidecar", status: "skip", reason: "not-run-by-diagnostics-bundle" },
      { name: "logs", status: "skip", reason: "no arbitrary log files are read" },
      { name: "sync", status: "skip", reason: "database and outbox sync are not executed" },
      { name: "provider", status: "skip", reason: "network providers are not contacted" },
      { name: "tauriCommandSmoke", status: "skip", reason: "GUI and Tauri command runner are not started" }
    ]
  });
