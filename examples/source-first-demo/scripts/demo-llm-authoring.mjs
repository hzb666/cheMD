#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const demoRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(demoRoot, "..", "..");
const draftDir = mkdtempSync(path.join(tmpdir(), "chemd-llm-authoring-"));
const draftPath = path.join(draftDir, "draft.chemd");
const inputPath = path.join(demoRoot, "llm-authoring", "001-simple-suzuki", "input.txt");
const chemdCliPath = path.join(repoRoot, "packages", "cli", "bin", "chemd.mjs");
const mockDriverPath = path.join(demoRoot, "llm-driver", "mock-source-repair-driver.mjs");
const mockOutput = readFileSync(
  path.join(demoRoot, "llm-authoring", "001-simple-suzuki", "output.chemd"),
  "utf8"
);

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    const detail = result.error ? ` (${result.error.message})` : "";
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}${detail}`);
  }

  return result;
};

const runChemd = (args) => run(process.execPath, [chemdCliPath, ...args]);

try {
  const authoring = run(process.execPath, [
    path.join(demoRoot, "llm-authoring", "nl-to-chemd.mjs"),
    inputPath
  ], {
    env: {
      ...process.env,
      CHEMD_LLM_MOCK_OUTPUT: mockOutput
    }
  });
  writeFileSync(draftPath, authoring.stdout);

  runChemd(["validate", draftPath]);
  runChemd(["repair", draftPath, "--format", "text"]);
  runChemd([
    "agent-loop",
    path.join(demoRoot, "llm-authoring", "006-syntax-repair", "bad.chemd"),
    "--driver",
    process.execPath,
    "--driver-arg",
    mockDriverPath,
    "--format",
    "text"
  ]);
  runChemd([
    "agent-loop",
    path.join(demoRoot, "llm-authoring", "007-reference-repair", "bad.chemd"),
    "--driver",
    process.execPath,
    "--driver-arg",
    mockDriverPath,
    "--format",
    "text"
  ]);
  runChemd([
    "diff",
    path.join(demoRoot, "demo-diff", "attempt-a.chemd"),
    path.join(demoRoot, "demo-diff", "attempt-b.chemd"),
    "--format",
    "text"
  ]);
} finally {
  rmSync(draftDir, { recursive: true, force: true });
}
