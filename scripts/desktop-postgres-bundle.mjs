#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

const REQUIRED_BINARIES = ["initdb", "psql"];
const SERVER_BINARIES = ["postgres", "pg_ctl"];

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

export const stagePostgresBinaries = ({
  sourceDir,
  targetBinDir = path.join(REPO_ROOT, POSTGRES_RESOURCE_BIN_PATH),
  targetResourceDir = path.dirname(targetBinDir),
  fileExists = existsSync,
  platform = process.platform,
  stat = statSync,
  copyContents = copyDirectoryContents
}) => {
  const source = resolvePostgresDistribution({ sourceDir, fileExists, platform });
  if (!stat(source.binDir).isDirectory()) {
    throw new Error(`PostgreSQL source is not a directory: ${source.binDir}`);
  }

  if (source.binOnly) {
    if (path.resolve(source.binDir) !== path.resolve(targetBinDir)) {
      copyContents({ sourceDir: source.binDir, targetDir: targetBinDir });
    }
  } else if (path.resolve(source.sourceRootDir) !== path.resolve(targetResourceDir)) {
    copyContents({ sourceDir: source.sourceRootDir, targetDir: targetResourceDir });
  }

  const staged = inspectPostgresBinDir({ binDir: targetBinDir, fileExists, platform });
  if (!staged.ok) {
    throw new Error(`Staged PostgreSQL binaries are missing: ${staged.missing.join(", ")}.`);
  }

  return {
    sourceRootDir: source.sourceRootDir,
    sourceBinDir: source.binDir,
    targetResourceDir,
    targetBinDir,
    binaries: staged.binaries
  };
};

export const verifyStagedPostgresBinaries = ({
  targetBinDir = path.join(REPO_ROOT, POSTGRES_RESOURCE_BIN_PATH),
  fileExists = existsSync,
  platform = process.platform
} = {}) => {
  const result = inspectPostgresBinDir({ binDir: targetBinDir, fileExists, platform });
  if (!result.ok) {
    throw new Error(`Staged PostgreSQL binaries are missing: ${result.missing.join(", ")}.`);
  }
  return result;
};

export const parseDesktopPostgresBundleArgs = (argv) => {
  const options = { source: "", verify: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--verify") {
      options.verify = true;
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
  "  node scripts/desktop-postgres-bundle.mjs --source <postgres-dist>",
  "  node scripts/desktop-postgres-bundle.mjs --verify",
  "",
  "Source may be a PostgreSQL distribution directory or, for local development only, its bin directory.",
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
      const result = verifyStagedPostgresBinaries();
      logger.log(`PostgreSQL bundle resources verified: ${result.binDir}`);
      return 0;
    }

    const sourceDir = options.source || env.CHEMD_POSTGRES_DIST_DIR;
    const result = stagePostgresBinaries({ sourceDir });
    logger.log(`PostgreSQL bundle resources staged: ${result.targetBinDir}`);
    logger.log(`Source bin: ${result.sourceBinDir}`);
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runDesktopPostgresBundleCli();
}
