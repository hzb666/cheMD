#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
export const POSTGRES_RESOURCE_BIN_PATH = path.join(
  "apps",
  "desktop",
  "src-tauri",
  "resources",
  "postgres",
  "bin"
);
export const POSTGRES_RESOURCE_PATH = path.dirname(POSTGRES_RESOURCE_BIN_PATH);
export const POSTGRES_BUNDLE_MANIFEST_FILE_NAME = "chemd-postgres-bundle-manifest.json";

const REQUIRED_BINARIES = ["initdb", "psql"];
const SERVER_BINARIES = ["postgres", "pg_ctl"];
const REQUIRED_BINARY_LABELS = [...REQUIRED_BINARIES, "postgres or pg_ctl"];

const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

const executableCandidates = ({ dir, name, platform }) => {
  const candidates = [path.join(dir, name)];
  if (platform === "win32") {
    candidates.push(path.join(dir, `${name}.exe`));
  }
  return candidates;
};

const executableInDir = ({ dir, name, fileExists, platform }) =>
  executableCandidates({ dir, name, platform }).find((filePath) => fileExists(filePath)) || "";

export const inspectPostgresBinDir = ({
  binDir,
  fileExists = existsSync,
  platform = process.platform
}) => {
  const binaries = {};
  const missing = [];

  for (const name of REQUIRED_BINARIES) {
    const filePath = executableInDir({ dir: binDir, name, fileExists, platform });
    if (filePath) {
      binaries[name] = filePath;
    } else {
      missing.push(name);
    }
  }

  const serverBinary = SERVER_BINARIES.find((name) => {
    const filePath = executableInDir({ dir: binDir, name, fileExists, platform });
    if (filePath) {
      binaries[name] = filePath;
      return true;
    }
    return false;
  });

  if (!serverBinary) {
    missing.push("postgres or pg_ctl");
  }

  return {
    ok: missing.length === 0,
    binDir,
    binaries,
    missing
  };
};

export const resolvePostgresDistribution = ({
  sourceDir,
  fileExists = existsSync,
  platform = process.platform
}) => {
  const source = safeTrim(sourceDir);
  if (!source) {
    throw new Error("Set CHEMD_POSTGRES_DIST_DIR or pass --source <path>.");
  }

  const distributionBin = inspectPostgresBinDir({
    binDir: path.join(source, "bin"),
    fileExists,
    platform
  });
  if (distributionBin.ok) {
    return {
      ...distributionBin,
      sourceRootDir: source,
      binOnly: false
    };
  }

  const directBin = inspectPostgresBinDir({ binDir: source, fileExists, platform });
  if (directBin.ok) {
    return {
      ...directBin,
      sourceRootDir: source,
      binOnly: true
    };
  }

  const candidates = [path.join(source, "bin"), source];
  const checked = candidates.join(", ");
  const missing = [distributionBin, directBin]
    .map((result) => result.missing.join(", "))
    .join("; ");
  throw new Error(`PostgreSQL binaries not found. Checked: ${checked}. Missing: ${missing}.`);
};

export const resolvePostgresBinDir = (options) => resolvePostgresDistribution(options);

const copyDirectoryContents = ({ sourceDir, targetDir }) => {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    cpSync(sourcePath, targetPath, { recursive: entry.isDirectory(), force: true });
  }
};

const manifestPathForResourceDir = (targetResourceDir) =>
  path.join(targetResourceDir, POSTGRES_BUNDLE_MANIFEST_FILE_NAME);

const buildVerificationSummary = ({ manifest, serverBinaryName }) => {
  const mode = manifest.binOnly ? "bin-only development staging" : "full distribution staging";
  const proof = manifest.binOnly
    ? "not a complete offline distribution proof"
    : "complete offline distribution proof";
  return [
    `OK: ${mode} verified for ${manifest.platform};`,
    `required binaries: ${manifest.requiredBinaries.join(", ")};`,
    `server binary: ${serverBinaryName};`,
    proof
  ].join(" ");
};

export const buildPostgresBundleManifest = ({
  source,
  staged,
  targetResourceDir,
  targetBinDir,
  platform,
  stagedAt = new Date().toISOString()
}) => {
  const serverBinaryName =
    SERVER_BINARIES.find((name) => Object.prototype.hasOwnProperty.call(staged.binaries, name)) ||
    "unknown";
  const manifest = {
    schemaVersion: 1,
    stagedAt,
    platform,
    mode: source.binOnly ? "bin-only-development" : "full-distribution",
    binOnly: source.binOnly,
    sourceRoot: source.sourceRootDir,
    sourceBin: source.binDir,
    targetResource: targetResourceDir,
    targetBin: targetBinDir,
    requiredBinaries: REQUIRED_BINARY_LABELS,
    resolvedBinaries: staged.binaries,
    verificationSummary: ""
  };
  manifest.verificationSummary = buildVerificationSummary({ manifest, serverBinaryName });
  return manifest;
};

export const readPostgresBundleManifest = ({
  targetResourceDir,
  fileExists = existsSync,
  readFile = readFileSync
}) => {
  const manifestPath = manifestPathForResourceDir(targetResourceDir);
  if (!fileExists(manifestPath)) {
    return { manifest: null, manifestPath };
  }

  const manifest = JSON.parse(readFile(manifestPath, "utf8"));
  return { manifest, manifestPath };
};

const copyResolvedPostgresDistribution = ({
  source,
  targetResourceDir,
  targetBinDir,
  copyContents
}) => {
  if (source.binOnly) {
    if (path.resolve(source.binDir) !== path.resolve(targetBinDir)) {
      copyContents({ sourceDir: source.binDir, targetDir: targetBinDir });
    }
    return;
  }

  if (path.resolve(source.sourceRootDir) !== path.resolve(targetResourceDir)) {
    copyContents({ sourceDir: source.sourceRootDir, targetDir: targetResourceDir });
  }
};

export const stagePostgresBinaries = ({
  sourceDir,
  targetBinDir = path.join(REPO_ROOT, POSTGRES_RESOURCE_BIN_PATH),
  targetResourceDir = path.dirname(targetBinDir),
  fileExists = existsSync,
  platform = process.platform,
  stat = statSync,
  copyContents = copyDirectoryContents,
  writeFile = writeFileSync,
  now = () => new Date(),
  requireFullDistribution = false
}) => {
  const source = resolvePostgresDistribution({ sourceDir, fileExists, platform });
  if (requireFullDistribution && source.binOnly) {
    throw new Error("Full PostgreSQL distribution proof is required, but source was bin-only.");
  }

  if (!stat(source.binDir).isDirectory()) {
    throw new Error(`PostgreSQL source is not a directory: ${source.binDir}`);
  }

  copyResolvedPostgresDistribution({ source, targetResourceDir, targetBinDir, copyContents });

  const staged = inspectPostgresBinDir({ binDir: targetBinDir, fileExists, platform });
  if (!staged.ok) {
    throw new Error(`Staged PostgreSQL binaries are missing: ${staged.missing.join(", ")}.`);
  }

  const manifest = buildPostgresBundleManifest({
    source,
    staged,
    targetResourceDir,
    targetBinDir,
    platform,
    stagedAt: now().toISOString()
  });
  const manifestPath = manifestPathForResourceDir(targetResourceDir);
  writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    sourceRootDir: source.sourceRootDir,
    sourceBinDir: source.binDir,
    targetResourceDir,
    targetBinDir,
    binaries: staged.binaries,
    binOnly: source.binOnly,
    manifest,
    manifestPath
  };
};

export const verifyStagedPostgresBinaries = ({
  targetBinDir = path.join(REPO_ROOT, POSTGRES_RESOURCE_BIN_PATH),
  targetResourceDir = path.dirname(targetBinDir),
  fileExists = existsSync,
  platform = process.platform,
  requireFullDistribution = false,
  readFile = readFileSync
} = {}) => {
  const result = inspectPostgresBinDir({ binDir: targetBinDir, fileExists, platform });
  if (!result.ok) {
    throw new Error(`Staged PostgreSQL binaries are missing: ${result.missing.join(", ")}.`);
  }

  const { manifest, manifestPath } = readPostgresBundleManifest({
    targetResourceDir,
    fileExists,
    readFile
  });
  if (requireFullDistribution && (!manifest || manifest.binOnly)) {
    throw new Error(
      "Full PostgreSQL distribution proof is required, but the staged manifest is missing or bin-only."
    );
  }

  const verificationSummary =
    manifest?.verificationSummary ||
    `OK: staged PostgreSQL binaries verified for ${platform}; manifest proof unavailable.`;
  return {
    ...result,
    manifest,
    manifestPath,
    verificationSummary
  };
};

export const parseDesktopPostgresBundleArgs = (argv) => {
  const options = { source: "", verify: false, help: false, requireFullDistribution: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify") {
      options.verify = true;
    } else if (arg === "--require-full") {
      options.requireFullDistribution = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--source") {
      options.source = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
};

const usage = () => [
  "Usage:",
  "  node scripts/desktop-postgres-bundle.mjs --source <postgres-dist> [--require-full]",
  "  node scripts/desktop-postgres-bundle.mjs --verify [--require-full]",
  "",
  "Source may be a PostgreSQL distribution directory or, for local development only, its bin directory.",
  "--require-full fails when the staged manifest is missing or bin-only.",
  "When --source is omitted, CHEMD_POSTGRES_DIST_DIR is used."
].join("\n");

export const runDesktopPostgresBundleCli = ({
  argv = process.argv.slice(2),
  env = process.env,
  logger = console
} = {}) => {
  try {
    const options = parseDesktopPostgresBundleArgs(argv);
    if (options.help) {
      logger.log(usage());
      return 0;
    }

    if (options.verify) {
      const result = verifyStagedPostgresBinaries({
        requireFullDistribution: options.requireFullDistribution
      });
      logger.log(`PostgreSQL bundle resources verified: ${result.binDir}`);
      logger.log(`Manifest: ${result.manifestPath}`);
      logger.log(result.verificationSummary);
      return 0;
    }

    const sourceDir = options.source || env.CHEMD_POSTGRES_DIST_DIR;
    const result = stagePostgresBinaries({
      sourceDir,
      requireFullDistribution: options.requireFullDistribution
    });
    logger.log(`PostgreSQL bundle resources staged: ${result.targetBinDir}`);
    logger.log(`Source bin: ${result.sourceBinDir}`);
    logger.log(`Manifest: ${result.manifestPath}`);
    logger.log(result.manifest.verificationSummary);
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runDesktopPostgresBundleCli();
}
