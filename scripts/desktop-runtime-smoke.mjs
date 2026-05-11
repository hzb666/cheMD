#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  formatLoadedEnvFiles,
  loadPostgresEnv,
  REPO_ROOT,
  runPostgresSmoke,
  withPostgresRuntimeClient
} from "./postgres-tools.mjs";

const DESKTOP_APP_DIR = path.join("apps", "desktop");
const DESKTOP_PACKAGE_PATH = path.join(DESKTOP_APP_DIR, "package.json");
const TAURI_CONFIG_PATH = path.join(
  DESKTOP_APP_DIR,
  "src-tauri",
  "tauri.conf.json"
);
const DESKTOP_DIST_INDEX_PATH = path.join(DESKTOP_APP_DIR, "dist", "index.html");

const readJsonFile = ({ rootDir, relativePath, readTextFile }) =>
  JSON.parse(readTextFile(path.resolve(rootDir, relativePath), "utf8"));

const addCheck = (checks, name, status, detail) => {
  checks.push({ name, status, detail });
};

const checkDesktopPackage = ({ checks, rootDir, fileExists, readTextFile }) => {
  if (!fileExists(path.resolve(rootDir, DESKTOP_PACKAGE_PATH))) {
    addCheck(checks, "desktop package", "fail", `${DESKTOP_PACKAGE_PATH} missing`);
    return false;
  }

  const packageJson = readJsonFile({
    rootDir,
    relativePath: DESKTOP_PACKAGE_PATH,
    readTextFile
  });
  const missingScripts = ["build", "typecheck", "tauri:build"].filter(
    (scriptName) => !packageJson.scripts?.[scriptName]
  );
  addCheck(
    checks,
    "desktop scripts",
    missingScripts.length === 0 ? "pass" : "fail",
    missingScripts.length === 0
      ? "build/typecheck/tauri:build available"
      : `missing ${missingScripts.join(", ")}`
  );
  return true;
};

const checkTauriConfig = ({ checks, rootDir, fileExists, readTextFile }) => {
  if (!fileExists(path.resolve(rootDir, TAURI_CONFIG_PATH))) {
    addCheck(checks, "tauri config", "fail", `${TAURI_CONFIG_PATH} missing`);
    return;
  }

  const tauriConfig = readJsonFile({
    rootDir,
    relativePath: TAURI_CONFIG_PATH,
    readTextFile
  });
  const frontendDist = tauriConfig.build?.frontendDist;
  addCheck(
    checks,
    "tauri frontendDist",
    typeof frontendDist === "string" && frontendDist.length > 0 ? "pass" : "fail",
    frontendDist || "missing"
  );
};

const checkDesktopDistArtifact = ({ checks, rootDir, fileExists }) => {
  const hasDistIndex = fileExists(path.resolve(rootDir, DESKTOP_DIST_INDEX_PATH));
  addCheck(
    checks,
    "desktop dist artifact",
    hasDistIndex ? "pass" : "warn",
    hasDistIndex
      ? DESKTOP_DIST_INDEX_PATH
      : `${DESKTOP_DIST_INDEX_PATH} missing; run desktop build before packaging`
  );
};

export const getPostgresDatabaseUrl = (env) =>
  env.CHEMD_POSTGRES_DATABASE_URL?.trim() || env.DATABASE_URL?.trim() || "";

export const summarizePostgresTarget = (databaseUrl) => {
  try {
    const parsed = new URL(databaseUrl);
    return [
      `host=${parsed.hostname || "(unknown)"}`,
      `port=${parsed.port || "(default)"}`,
      `database=${parsed.pathname.replace(/^\//u, "") || "(default)"}`,
      `user=${parsed.username || "(none)"}`,
      `password=${parsed.password ? "[REDACTED]" : "(none)"}`
    ].join(", ");
  } catch {
    return "configured=true, url=[REDACTED]";
  }
};

export const checkDesktopRuntimePreconditions = ({
  rootDir = REPO_ROOT,
  fileExists = existsSync,
  readTextFile = readFileSync
} = {}) => {
  const checks = [];

  const hasPackage = checkDesktopPackage({
    checks,
    rootDir,
    fileExists,
    readTextFile
  });
  if (!hasPackage) {
    return { ok: false, checks };
  }

  checkTauriConfig({ checks, rootDir, fileExists, readTextFile });
  checkDesktopDistArtifact({ checks, rootDir, fileExists });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
};

const logDesktopChecks = (logger, checks) => {
  for (const check of checks) {
    logger.log(`[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`);
  }
};

export const runDesktopRuntimeSmoke = async ({
  rootDir = REPO_ROOT,
  envLoader = loadPostgresEnv,
  desktopCheck = checkDesktopRuntimePreconditions,
  withClient = withPostgresRuntimeClient,
  postgresSmoke = runPostgresSmoke,
  logger = console
} = {}) => {
  logger.log("Chemd desktop runtime smoke starting.");
  const { env, loadedFiles } = envLoader({ rootDir });
  logger.log(`Loaded env files: ${formatLoadedEnvFiles(loadedFiles)}`);

  const desktop = desktopCheck({ rootDir });
  logDesktopChecks(logger, desktop.checks);
  if (!desktop.ok) {
    throw new Error("Desktop runtime preflight failed.");
  }

  const databaseUrl = getPostgresDatabaseUrl(env);
  if (!databaseUrl) {
    logger.log(
      "SKIP desktop runtime smoke: CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL is not configured."
    );
    return { status: "skipped", reason: "missing-postgres-env" };
  }

  logger.log(`PostgreSQL target: ${summarizePostgresTarget(databaseUrl)}`);
  const result = await withClient({
    env,
    operation: (client) => postgresSmoke({ client })
  });

  logger.log("Chemd desktop runtime smoke passed.");
  logger.log(`experiment: ${result.experimentId}`);
  logger.log(`revision: ${result.revisionId}`);
  logger.log(`compile run: ${result.compileRunId}`);
  logger.log(`rag chunks: ${result.ragChunks}`);
  logger.log(`first chunk: ${result.firstChunkId}`);
  return { status: "passed", result };
};

export const runDesktopRuntimeSmokeCli = async ({
  runner = runDesktopRuntimeSmoke,
  logger = console
} = {}) => {
  try {
    await runner({ logger });
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDesktopRuntimeSmokeCli().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
