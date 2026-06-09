import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const demoRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(demoRoot, "..", "..");
const scriptPath = path.join(demoRoot, "llm-authoring", "nl-to-chemd.mjs");
const demoScriptPath = path.join(demoRoot, "scripts", "demo-llm-authoring.mjs");

test("nl-to-chemd strips chemd fences in mock mode", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chemd-llm-demo-"));

  try {
    const inputPath = path.join(dir, "input.txt");
    writeFileSync(inputPath, "Make a minimal Suzuki record.");

    const result = spawnSync(process.execPath, [scriptPath, inputPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CHEMD_LLM_MOCK_OUTPUT: "```chemd\nmodule exp_mock\n\nmeta {\n  id: \"exp-mock\"\n  title: \"Mock\"\n  date: \"2026-06-08\"\n}\n\nreaction rxn_main {\n  reactants: [\"substrate\"]\n}\n```"
      }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^module exp_mock/);
    assert.doesNotMatch(result.stdout, /```/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nl-to-chemd rejects JSON-shaped mock output", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "chemd-llm-demo-"));

  try {
    const inputPath = path.join(dir, "input.txt");
    writeFileSync(inputPath, "Make a minimal record.");

    const result = spawnSync(process.execPath, [scriptPath, inputPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CHEMD_LLM_MOCK_OUTPUT: "{\"source\":\"module exp_bad\"}"
      }
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /LLM output looked like JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("demo-llm-authoring script completes on the local platform", () => {
  const result = spawnSync(process.execPath, [demoScriptPath], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Fix .*draft\.chemd/);
  assert.match(result.stdout, /typed:reaction #rxn_main/);
});
