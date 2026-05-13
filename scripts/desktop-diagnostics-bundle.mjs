#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export {
  buildDesktopDiagnosticsBundle,
  KNOWN_DESKTOP_COMMAND_NAMES
} from "./desktop-diagnostics-bundle-core.mjs";
export {
  redactDiagnosticsValue,
  sanitizeDiagnosticValue
} from "./desktop-diagnostics-sanitizer.mjs";

import { buildDesktopDiagnosticsBundle } from "./desktop-diagnostics-bundle-core.mjs";

const DEFAULT_OUTPUT_DIR = path.join(os.tmpdir(), "chemd-desktop-diagnostics-bundle");

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
