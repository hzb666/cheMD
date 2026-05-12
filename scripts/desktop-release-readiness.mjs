#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { buildDesktopDiagnosticsBundle } from "./desktop-diagnostics-bundle-core.mjs";
import { sanitizeDiagnosticValue } from "./desktop-diagnostics-sanitizer.mjs";
import { checkDesktopOfflineReleaseSmokePreflight } from "./desktop-offline-release-smoke.mjs";
import { checkDesktopRuntimePreconditions } from "./desktop-runtime-smoke.mjs";
import { REPO_ROOT } from "./postgres-tools.mjs";

const SCHEMA_VERSION = 1;

const NOT_RUN_CHECKS = [
  {
    name: "cleanMachineInstallerSmoke",
    status: "skip",
    result: "not-run",
    reason: "requires a separate clean machine install and launch smoke"
  },
  {
    name: "realNetwork",
    status: "skip",
    result: "not-run",
    reason: "release readiness is offline-only and never opens network connections"
  }
];

export const normalizeReadinessStatus = (status) => {
  if (["pass", "passed", "ok"].includes(status)) {
    return "pass";
  }
  if (["blocked", "fail", "failed"].includes(status)) {
    return "blocked";
  }
  return "skip";
};

export const computeOverallStatus = (checks) => {
  const statuses = checks.map((check) => check.status);
  if (statuses.includes("blocked")) {
    return "blocked";
  }
  if (statuses.includes("skip")) {
    return "skip";
  }
  return "pass";
};

const replaceRootPath = ({ rootDir, value }) => {
  if (typeof value !== "string") {
    return value;
  }
  return value.replaceAll(path.resolve(rootDir), ".");
};

const redactSensitiveText = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  return value
    .replace(/\b(?:https?|postgres(?:ql)?):\/\/[^\s"'<>]+/giu, "[REDACTED_URL]")
    .replace(
      /([?&](?:api_key|apikey|password|secret|token)=)[^&\s]+/giu,
      "$1[REDACTED]"
    );
};

const sanitizeCheckDetail = ({ rootDir, detail }) =>
  sanitizeDiagnosticValue(
    redactSensitiveText(replaceRootPath({ rootDir, value: detail })),
    "detail"
  );

const summarizeChecks = ({ rootDir, checks = [] }) =>
  checks.map((check) => ({
    name: check.name,
    status: normalizeReadinessStatus(check.status),
    detail: sanitizeCheckDetail({ rootDir, detail: check.detail })
  }));

const buildRuntimePreconditionCheck = ({ rootDir, desktopCheck }) => {
  const result = desktopCheck({ rootDir });
  return {
    name: "desktopRuntimePreconditions",
    status: result.ok ? "pass" : "blocked",
    result: result.ok ? "passed" : "blocked",
    reason: result.ok ? "desktop-runtime-preconditions-ready" : "desktop-runtime-preconditions-blocked",
    checks: summarizeChecks({ rootDir, checks: result.checks })
  };
};

const buildReleasePreflightCheck = async ({ rootDir, releasePreflight }) => {
  const result = await releasePreflight({ rootDir });
  const status = normalizeReadinessStatus(result.status);
  return {
    name: "offlineReleasePreflight",
    status,
    result: result.status,
    reason: result.reason,
    detail: result.detail ? sanitizeCheckDetail({ rootDir, detail: result.detail }) : null,
    releaseExePath: result.releaseExePath
      ? replaceRootPath({ rootDir, value: result.releaseExePath })
      : null,
    checks: summarizeChecks({ rootDir, checks: result.checks })
  };
};

const buildDiagnosticsBundleCheck = async ({ diagnosticsBuilder }) => {
  const bundle = await diagnosticsBuilder();
  return {
    name: "diagnosticsBundle",
    status: "pass",
    result: "built",
    reason: "diagnostics-bundle-built-offline",
    schemaVersion: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    supportContextStatus: bundle.supportContext?.offlineSmoke?.status ?? "skip",
    boundary: "built without GUI, network, database smoke, or .env loading"
  };
};

const blockedCheck = ({ rootDir, name, error }) => ({
  name,
  status: "blocked",
  result: "error",
  reason: sanitizeCheckDetail({
    rootDir,
    detail: error instanceof Error ? error.message : String(error)
  })
});

const collectChecks = async ({
  rootDir,
  desktopCheck,
  releasePreflight,
  diagnosticsBuilder
}) => {
  const checks = [];
  try {
    checks.push(buildRuntimePreconditionCheck({ rootDir, desktopCheck }));
  } catch (error) {
    checks.push(blockedCheck({ rootDir, name: "desktopRuntimePreconditions", error }));
  }
  try {
    checks.push(await buildReleasePreflightCheck({ rootDir, releasePreflight }));
  } catch (error) {
    checks.push(blockedCheck({ rootDir, name: "offlineReleasePreflight", error }));
  }
  try {
    checks.push(await buildDiagnosticsBundleCheck({ diagnosticsBuilder }));
  } catch (error) {
    checks.push(blockedCheck({ rootDir, name: "diagnosticsBundle", error }));
  }
  return checks.concat(NOT_RUN_CHECKS);
};

export const buildDesktopReleaseReadinessReport = async ({
  rootDir = REPO_ROOT,
  now = () => new Date(),
  desktopCheck = (options) =>
    checkDesktopRuntimePreconditions({
      fileExists: existsSync,
      readTextFile: readFileSync,
      ...options
    }),
  releasePreflight = (options) =>
    checkDesktopOfflineReleaseSmokePreflight({
      fileExists: existsSync,
      readTextFile: readFileSync,
      ...options
    }),
  diagnosticsBuilder = () => buildDesktopDiagnosticsBundle({ rootDir })
} = {}) => {
  const checks = await collectChecks({
    rootDir,
    desktopCheck,
    releasePreflight,
    diagnosticsBuilder
  });
  const overallStatus = computeOverallStatus(checks);
  return sanitizeDiagnosticValue({
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now().toISOString(),
    overallStatus,
    overall: {
      status: overallStatus,
      reason: overallStatus === "pass"
        ? "offline-release-readiness-passed"
        : overallStatus === "blocked"
          ? "one-or-more-offline-checks-blocked"
          : "offline-checks-complete-but-required-production-smoke-not-run"
    },
    boundaries: {
      offlineOnly: true,
      startsGui: false,
      opensNetwork: false,
      readsDotEnv: false,
      runsRuntimeSmokeDatabasePath: false
    },
    cleanMachineInstallerSmoke: NOT_RUN_CHECKS[0],
    realNetwork: NOT_RUN_CHECKS[1],
    checks
  });
};

const parseArgs = (argv) => {
  const parsed = { json: false, outputPath: "" };
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--output") {
      parsed.outputPath = args.shift() ?? "";
      if (!parsed.outputPath) {
        throw new Error("--output requires a path");
      }
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
};

const helpText = () => [
  "Usage: pnpm desktop:release-readiness [--json] [--output <path>]",
  "",
  "Aggregates offline desktop release readiness checks only.",
  "Does not start GUI, open network connections, load .env files, or run DB smoke."
].join("\n");

const formatSummary = (report) => [
  "Chemd desktop release readiness",
  `Overall: ${report.overallStatus.toUpperCase()} (${report.overall.reason})`,
  ...report.checks.map((check) => `[${check.status.toUpperCase()}] ${check.name}: ${check.reason}`),
  "Boundary: clean-machine installer smoke and real network checks are not run."
].join("\n");

export const runDesktopReleaseReadiness = async ({
  outputPath,
  reportBuilder = buildDesktopReleaseReadinessReport,
  makeDir = mkdirSync,
  writeTextFile = writeFileSync
} = {}) => {
  const report = await reportBuilder();
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) {
    makeDir(path.dirname(outputPath), { recursive: true });
    writeTextFile(outputPath, json, "utf8");
  }
  return { report, json, outputPath };
};

export const runDesktopReleaseReadinessCli = async ({
  argv = process.argv.slice(2),
  logger = console,
  runner = runDesktopReleaseReadiness,
  runOptions = {}
} = {}) => {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      logger.log(helpText());
      return 0;
    }
    const result = await runner({ ...runOptions, outputPath: args.outputPath });
    if (args.json) {
      logger.log(result.json.trimEnd());
    } else {
      logger.log(formatSummary(result.report));
      if (result.outputPath) {
        logger.log(`Release readiness JSON written: ${result.outputPath}`);
      }
    }
    return result.report.overallStatus === "blocked" ? 2 : 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopReleaseReadinessCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
