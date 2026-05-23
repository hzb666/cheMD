import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  EXIT_OK,
  EXIT_USAGE,
  EXIT_VALIDATION_FAILED,
  runChemdCli
} from "./cli";
import type { GitRunner } from "./git-changed";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleAgentLoopDriverPath = path.join(packageRoot, "examples", "mock-agent-loop-driver.mjs");

const createWriter = () => {
  let value = "";

  return {
    get value() {
      return value;
    },
    write(chunk: string) {
      value += String(chunk);
      return true;
    }
  };
};

const withTempDir = async <T>(callback: (dir: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(path.join(tmpdir(), "chemd-cli-"));

  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const validSource = `---
id: exp-cli-valid
title: CLI Valid
date: 2026-04-19
---

:::chemd #mol-main
kind: molecule
smiles: CCO
:::
`;

const invalidKindSource = `---
id: exp-cli-invalid
title: CLI Invalid
date: 2026-04-19
---

:::chemd #mol-main
kind: reagent
smiles: CCO
:::
`;

const fixableSource = `---
id: exp-cli-fix
title: CLI Fix
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72%
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;

const fixNeedsInputSource = `---
id: exp-cli-fix-input
title: CLI Fix Input
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::
`;

const beforeDiffSource = `---
id: exp-cli-diff
title: CLI Diff Before
date: 2026-04-19
---

:::chemd #rxn-main
kind: reaction
reac: CCO
prod: CC=O
temperature: 25 C
:::

:::result #res-main
yield: 23%
:::

:::sample #sample-old
name: old sample
:::
`;

const afterDiffSource = `---
id: exp-cli-diff
title: CLI Diff After
date: 2026-04-19
---

:::chemd #rxn-main
kind: reaction
reac: CCO
prod: CC=O
temperature: 80 C
:::

:::result #res-main
yield: 41%
:::

:::analysis #ana-new
type: tlc
result: clean
:::
`;

const noExplicitIdBeforeSource = `---
id: exp-cli-no-id
title: CLI No ID Before
date: 2026-04-19
---

:::chemd
kind: molecule
smiles: CCO
:::
`;

const noExplicitIdAfterSource = `---
id: exp-cli-no-id
title: CLI No ID After
date: 2026-04-19
---

:::chemd
kind: molecule
smiles: CCC
:::
`;

const graphFamilyASource = `---
id: exp-cli-graph-a
title: CLI Graph A
date: 2026-04-21
---

:::chemd #rxn-a
kind: reaction
name: esterification of acid A
reactants: acid-a | alcohol
products: ester-a
:::

:::procedure #proc-a
step: add | materials=acid-a
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

const graphFamilyBSource = `---
id: exp-cli-graph-b
title: CLI Graph B
date: 2026-04-23
---

:::chemd #rxn-b
kind: reaction
name: esterification of acid B
reactants: acid-b | alcohol
products: ester-b
:::

:::procedure #proc-b
step: add | materials=acid-b
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

const preflightSource = `---
id: exp-cli-preflight
title: CLI Preflight
date: 2026-05-20
---

:::procedure #proc-main
step: heat | id=s-heat | temperature=80 C | duration=30 min
:::
`;

const proseImportSource = "加入 n-BuLi 后体系逐渐变深红色。";
const proseImportPartialCoverageSource =
  "The organic phases were washed with brine, dried over Na2SO4, filtered, and concentrated under reduced pressure.";

const runInTempDir = async (
  argv: string[],
  files: Record<string, string>,
  options: { gitRunner?: GitRunner } = {}
) => withTempDir(async (dir) => {
  for (const [fileName, source] of Object.entries(files)) {
    writeFileSync(path.join(dir, fileName), source);
  }

  const stdout = createWriter();
  const stderr = createWriter();
  const exitCode = await runChemdCli(argv, { cwd: dir, stderr, stdout, ...options });

  return { exitCode, stderr: stderr.value, stdout: stdout.value };
});

const createGitRunner = ({
  show = {},
  tracked = "",
  untracked = ""
}: {
  show?: Record<string, string>;
  tracked?: string;
  untracked?: string;
}): GitRunner => (args) => {
  if (args[0] === "diff") {
    return { status: 0, stdout: tracked, stderr: "" };
  }

  if (args[0] === "ls-files") {
    return { status: 0, stdout: untracked, stderr: "" };
  }

  if (args[0] === "show") {
    const value = show[args[1]];
    return value === undefined
      ? { status: 1, stdout: "", stderr: `missing fixture: ${args[1]}` }
      : { status: 0, stdout: value, stderr: "" };
  }

  return { status: 1, stdout: "", stderr: `unexpected git args: ${args.join(" ")}` };
};

describe("chemd cli help validation export and fix", () => {
  it("runs package bin help through the local TypeScript loader", () => {
    const result = spawnSync(process.execPath, ["bin/chemd.mjs", "--help"], {
      cwd: packageRoot,
      encoding: "utf8"
    });

    expect(result.status).toBe(EXIT_OK);
    expect(result.stdout).toContain("Usage:");
    expect(result.stderr).toBe("");
  });

  it("validates a valid chemd document", async () => {
    const result = await runInTempDir(["validate", "valid.chemd"], {
      "valid.chemd": validSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/valid\.chemd: ok/);
    expect(result.stderr).toBe("");
  }, 10000);

  it("exits 1 when compiler diagnostics include an error", async () => {
    const result = await runInTempDir(["validate", "invalid.chemd"], {
      "invalid.chemd": invalidKindSource
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toMatch(/1 error\(s\)/);
    expect(result.stdout).toContain("E_CHEMD_KIND_CONFLICT");
  });

  it("applies deterministic safe fixes and prints the clean source in text mode", async () => {
    const result = await runInTempDir(["fix", "fix.chemd"], {
      "fix.chemd": fixableSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/final status: clean/);
    expect(result.stdout).toMatch(/safe fixes applied: 5/);
    expect(result.stdout).toContain("ref: rxn-main");
    expect(result.stderr).toBe("");
  });

  it("writes the fixed source back to disk when --write is set", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "fix.chemd");
      writeFileSync(filePath, fixableSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli(["fix", "fix.chemd", "--write"], {
        cwd: dir,
        stderr,
        stdout
      });

      expect(exitCode).toBe(EXIT_OK);
      expect(stdout.value).toMatch(/wrote file: yes/);
      expect(readFileSync(filePath, "utf8")).toContain("ref: rxn-main");
      expect(stderr.value).toBe("");
    }));

  it("emits a structured non-clean fix report when authored facts are still required", async () => {
    const result = await runInTempDir(
      ["fix", "fix-input.chemd", "--format", "json"],
      { "fix-input.chemd": fixNeedsInputSource }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(payload.schemaVersion).toBe("chemd-fix/v0.1");
    expect(payload.finalDiagnosis.status).toBe("needs_author_input");
    expect(payload.finalDiagnosis.requiredInputs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checklistId: "basic-experiment-record"
      })
    ]));
    expect(payload.wroteFile).toBe(false);
    expect(result.stderr).toBe("");
  });

  it("rejects invalid fix iteration limits", async () => {
    const result = await runInTempDir(
      ["fix", "fix.chemd", "--max-iterations", "0"],
      { "fix.chemd": fixableSource }
    );

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Option --max-iterations must be a positive integer/);
  });

  it("exports JSON renderer output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "json"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.document.meta.id).toBe("exp-cli-valid");
    expect(result.stderr).toBe("");
  });

  it("exits 1 and suppresses payload output when export input has errors", async () => {
    const result = await runInTempDir(["export", "invalid.chemd", "--format", "json"], {
      "invalid.chemd": invalidKindSource
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("E_CHEMD_KIND_CONFLICT");
  });

  it("exports canonical LNF output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format=lnf"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-lnf/v0.5");
  });

  it("exports training output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "training"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-understanding/v0.1");
    expect(payload.governance.allowed_uses).toContain("rag");
    expect(payload.source_layer).toBeUndefined();
  });

  it("exports RAG output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "rag"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-rag-export/v0.1");
    expect(payload.governance.allowed_uses).toContain("rag");
    expect(payload.chunks.length).toBeGreaterThan(0);
    expect(payload.learning_layer).toBeUndefined();
  });

  it("exports full training audit output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "training-full"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-export/v0.2");
    expect(payload.governance.source).toBe("workspace_policy");
    expect(payload.source_layer.audit_only_fields).toContain("source_layer.raw_source");
    expect(payload.source_layer).toBeDefined();
  });

  it("reports training governance diagnostics through check --target training", async () => {
    const result = await runInTempDir(["check", "governance.chemd", "--target", "training", "--format", "json"], {
      "governance.chemd": `---
id: exp-cli-governance
title: CLI Governance
date: 2026-05-20
governance:
  pii_status: present
  allowed_uses: [audit]
---

:::sample #sample-main
name: patient sample
:::
`
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(payload.files[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_TRAINING_PII_PRESENT" }),
      expect.objectContaining({ code: "W_TRAINING_RAG_NOT_ALLOWED" })
    ]));
  });

  it("blocks non-audit training export when governance is blocking", async () => {
    const result = await runInTempDir(["export", "governance.chemd", "--format", "training"], {
      "governance.chemd": `---
id: exp-cli-governance-export
title: CLI Governance Export
date: 2026-05-20
governance:
  pii_status: present
  allowed_uses: [audit]
---

:::sample #sample-main
name: patient sample
:::
`
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("E_TRAINING_PII_PRESENT");
    expect(result.stderr).toContain("W_TRAINING_AUDIT_ONLY");
  });

  it("fixes deterministic safe fixes through the user-facing command", async () => {
    const result = await runInTempDir(["fix", "fix.chemd"], {
      "fix.chemd": fixableSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/safe fixes applied: 5/);
  });

  it("lists and instantiates domain templates", async () =>
    withTempDir(async (dir) => {
      const stdout = createWriter();
      const stderr = createWriter();
      const listCode = await runChemdCli(["templates", "--json"], { cwd: dir, stderr, stdout });
      const templates = JSON.parse(stdout.value);

      expect(listCode).toBe(EXIT_OK);
      expect(templates).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "organic-synthesis/suzuki-screen" })
      ]));

      const newStdout = createWriter();
      const newStderr = createWriter();
      const newCode = await runChemdCli([
        "new",
        "organic-synthesis/suzuki-screen",
        "--out",
        "exp.chemd"
      ], {
        cwd: dir,
        stderr: newStderr,
        stdout: newStdout
      });

      expect(newCode).toBe(EXIT_OK);
      expect(readFileSync(path.join(dir, "exp.chemd"), "utf8")).toContain(":::condition-varies");
      expect(newStderr.value).toBe("");
    }));

  it("imports prose to a Chemd draft in text mode", async () => {
    const result = await runInTempDir(["import", "prose", "procedure.txt"], {
      "procedure.txt": proseImportSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toContain("Prose import procedure.txt");
    expect(result.stdout).toContain(":::procedure #import-procedure");
    expect(result.stdout).toContain("step: add");
    expect(result.stdout).toContain(":::observation #import-observation");
    expect(result.stdout).toContain("event: color_change");
    expect(result.stderr).toBe("");
  });

  it("prints prose import coverage warnings and unparsed span counts", async () => {
    const result = await runInTempDir(["import", "prose", "procedure.txt"], {
      "procedure.txt": proseImportPartialCoverageSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/unparsed spans: [1-9]/);
    expect(result.stdout).toContain("W_IMPORT_PROSE_UNCOVERED_ACTION");
    expect(result.stdout).toContain("filtered");
    expect(result.stdout).toContain("step: wash");
    expect(result.stdout).toContain("step: dry");
    expect(result.stdout).toContain("step: concentrate");
    expect(result.stderr).toBe("");
  });

  it("writes imported Chemd to --out and keeps stdout as a summary", async () =>
    withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "procedure.txt"), proseImportSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "import",
        "prose",
        "procedure.txt",
        "--out",
        "draft.chemd"
      ], { cwd: dir, stderr, stdout });

      expect(exitCode).toBe(EXIT_OK);
      expect(stdout.value).toContain("wrote file: yes");
      expect(stdout.value).not.toContain(":::procedure #import-procedure");
      expect(readFileSync(path.join(dir, "draft.chemd"), "utf8")).toContain(
        ":::procedure #import-procedure"
      );
      expect(stderr.value).toBe("");
    }));

  it("emits structured JSON for prose import", async () => {
    const result = await runInTempDir(
      ["import", "prose", "procedure.txt", "--format", "json"],
      { "procedure.txt": proseImportSource }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-import-prose/v0.1");
    expect(payload.valid).toBe(true);
    expect(payload.stepCount).toBeGreaterThan(0);
    expect(payload.observationCount).toBeGreaterThan(0);
    expect(payload.chemd).toContain("step: add");
    expect(result.stderr).toBe("");
  });

  it("rejects unsupported export formats", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "xml"], {
      "valid.chemd": validSource
    });

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Export format must be one of/);
  });

  it("rejects base options on export", async () => {
    const result = await runInTempDir(
      ["export", "valid.chemd", "--base", "main", "--format", "json"],
      { "valid.chemd": validSource }
    );

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Unsupported option: --base/);
  });

  it("exports a graph index for multiple chemd files", async () => {
    const result = await runInTempDir(
      ["graph", "graph-a.chemd", "graph-b.chemd", "--format", "json"],
      {
        "graph-a.chemd": graphFamilyASource,
        "graph-b.chemd": graphFamilyBSource
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-graph-index/v0.1");
    expect(payload.index_scope.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ document_id: "exp-cli-graph-a", file_path: "graph-a.chemd" }),
      expect.objectContaining({ document_id: "exp-cli-graph-b", file_path: "graph-b.chemd" })
    ]));
    expect(payload.reaction_clusters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        basis: "family_procedure",
        reaction_family: "esterification"
      })
    ]));
    expect(payload.reaction_similarity_edges[0]).toMatchObject({
      basis: expect.arrayContaining(["same_family_procedure"]),
      warnings: ["semantic_similarity_without_computed_fingerprint"]
    });
    expect(result.stderr).toBe("");
  });

  it("rejects graph without input files", async () => {
    const result = await runInTempDir(["graph"], {});

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Graph requires at least one file path/);
  });

  it("reports missing files", async () => {
    const result = await runInTempDir(["validate", "missing.chemd"], {});

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Unable to read file/);
  });

  it("checks chemd files recursively with user-facing JSON output", async () =>
    withTempDir(async (dir) => {
      mkdirSync(path.join(dir, "fixtures", "valid"), { recursive: true });
      mkdirSync(path.join(dir, "fixtures", "invalid"), { recursive: true });
      writeFileSync(path.join(dir, "fixtures", "valid", "alias.chemd"), `---
id: exp-check-valid
title: Check valid
date: 2026-05-20
---

:::chemd #substrate
kind: mol
smiles: CCO
:::

:::chemd #rxn-main
kind: reac
reac: substrate
prod: product
:::
`);
      writeFileSync(path.join(dir, "fixtures", "invalid", "bad.chemd"), `---
id: exp-check-invalid
title: Check invalid
date: 2026-05-20
---

:::chemd #bad
smiles: CCO
unknown_field: should fail
:::
`);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "check",
        "fixtures",
        "--format",
        "json",
        "--dry-run"
      ], { cwd: dir, stderr, stdout });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(payload).toMatchObject({
        schemaVersion: "chemd-check/v0.1",
        dryRun: true,
        target: "validate",
        totals: expect.objectContaining({ error: 1 })
      });
      expect(payload.files.map((file: { filePath: string }) => file.filePath)).toEqual([
        path.join("fixtures", "invalid", "bad.chemd"),
        path.join("fixtures", "valid", "alias.chemd")
      ]);
      expect(payload.files[0].diagnostics[0]).toMatchObject({
        code: "W_UNKNOWN_FIELD",
        severity: "error",
        sourceField: "unknown_field"
      });
      expect(stderr.value).toBe("");
    }));

  it("runs runtime preflight with a user-provided lab context", async () =>
    withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "runtime.chemd"), preflightSource);
      writeFileSync(path.join(dir, "lab.json"), JSON.stringify({
        capabilities: ["heating"],
        devices: [{ capability: "heating", min: 20, max: 60, unit: "C" }]
      }));

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "preflight",
        "runtime.chemd",
        "--mode",
        "robot-run",
        "--context",
        "lab.json",
        "--format",
        "json",
        "--dry-run"
      ], { cwd: dir, stderr, stdout });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(payload).toMatchObject({
        schemaVersion: "chemd-preflight/v0.1",
        dryRun: true,
        mode: "robot-run",
        preflight: {
          blocking: true,
          issues: expect.arrayContaining([
            expect.objectContaining({ kind: "device_range", stepId: "s-heat" })
          ])
        }
      });
      expect(payload.preflight.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "E_RUNTIME_DEVICE_RANGE" })
      ]));
      expect(stderr.value).toBe("");
    }));
});

describe("chemd cli agent loop", () => {
  it("runs agent-loop through an external driver and emits a clean JSON report", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent.chemd");
      writeFileSync(filePath, fixNeedsInputSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "agent-loop",
        "agent.chemd",
        "--driver",
        process.execPath,
        "--driver-arg",
        exampleAgentLoopDriverPath,
        "--format",
        "json"
      ], {
        cwd: dir,
        stderr,
        stdout
      });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_OK);
      expect(payload.schemaVersion).toBe("chemd-agent-loop/v0.1");
      expect(payload.finalDiagnosis.status).toBe("clean");
      expect(payload.iterations[0].agentResponse).toMatchObject({
        action: "rewrite",
        changedSource: true,
        note: "add result and analysis"
      });
      expect(payload.finalSource).toContain(":::analysis #ana-main");
      expect(stderr.value).toBe("");
    }));

  it("writes the final clean source back to disk when agent-loop uses --write", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-write.chemd");
      writeFileSync(filePath, fixNeedsInputSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "agent-loop",
        "agent-write.chemd",
        "--driver",
        process.execPath,
        "--driver-arg",
        exampleAgentLoopDriverPath,
        "--write"
      ], {
        cwd: dir,
        stderr,
        stdout
      });

      expect(exitCode).toBe(EXIT_OK);
      expect(stdout.value).toMatch(/wrote file: yes/);
      expect(readFileSync(filePath, "utf8")).toContain(":::result #res-main");
      expect(stderr.value).toBe("");
    }));

  it("returns unresolved diagnosis when the external driver declines to rewrite", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-stop.chemd");
      writeFileSync(filePath, fixNeedsInputSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "agent-loop",
        "agent-stop.chemd",
        "--driver",
        process.execPath,
        "--driver-arg",
        exampleAgentLoopDriverPath,
        "--driver-arg",
        "stop",
        "--format",
        "json"
      ], {
        cwd: dir,
        stderr,
        stdout
      });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(payload.stoppedReason).toBe("needs_author_input");
      expect(payload.finalDiagnosis.status).toBe("needs_author_input");
      expect(payload.iterations[0].agentResponse).toMatchObject({
        action: "stop",
        changedSource: false,
        note: "need more facts"
      });
      expect(stderr.value).toBe("");
    }));

  it("passes dash-prefixed arguments to the external agent-loop driver", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-dash.chemd");
      writeFileSync(filePath, fixNeedsInputSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "agent-loop",
        "agent-dash.chemd",
        "--driver",
        process.execPath,
        "--driver-arg",
        exampleAgentLoopDriverPath,
        "--driver-arg",
        "--mode",
        "--format",
        "json"
      ], {
        cwd: dir,
        stderr,
        stdout
      });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_OK);
      expect(payload.finalDiagnosis.status).toBe("clean");
      expect(payload.iterations[0].agentResponse).toMatchObject({
        action: "rewrite",
        changedSource: true
      });
      expect(stderr.value).toBe("");
    }));

  it("rejects agent-loop invocations without a driver", async () => {
    const result = await runInTempDir(
      ["agent-loop", "agent.chemd"],
      { "agent.chemd": fixNeedsInputSource }
    );

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Agent loop requires --driver <cmd>/);
  });
});

describe("chemd cli diff", () => {
  it("writes human-readable semantic diff changes", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "after.chemd"], {
      "after.chemd": afterDiffSource,
      "before.chemd": beforeDiffSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/~ reaction #rxn-main/);
    expect(result.stdout).toMatch(/~ temperature: "25 C" -> "80 C"/);
    expect(result.stdout).toMatch(/~ result #res-main/);
    expect(result.stdout).toMatch(/~ yield: "23%" -> "41%"/);
    expect(result.stdout).toMatch(/\+ analysis #ana-new/);
    expect(result.stdout).toMatch(/- sample #sample-old/);
  });

  it("writes JSON semantic diff changes", async () => {
    const result = await runInTempDir(
      ["diff", "before.chemd", "after.chemd", "--format", "json"],
      {
        "after.chemd": afterDiffSource,
        "before.chemd": beforeDiffSource
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-semantic-diff/v0.1");
    expect(payload.changes.map(
      (change: { changeType: string; nodeType: string; nodeId: string }) =>
        `${change.changeType}:${change.nodeType}:${change.nodeId}`
    )).toEqual([
      "removed:sample:sample-old",
      "added:analysis:ana-new",
      "changed:reaction:rxn-main",
      "changed:result:res-main"
    ]);
  });

  it("ignores objects without explicit IDs in semantic diff", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "after.chemd"], {
      "after.chemd": noExplicitIdAfterSource,
      "before.chemd": noExplicitIdBeforeSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout.trim()).toBe("No semantic changes.");
  });

  it("reports no semantic changes", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "same.chemd"], {
      "before.chemd": beforeDiffSource,
      "same.chemd": beforeDiffSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout.trim()).toBe("No semantic changes.");
  });

  it("rejects unsupported diff formats", async () => {
    const result = await runInTempDir(
      ["diff", "before.chemd", "after.chemd", "--format", "xml"],
      {
        "after.chemd": afterDiffSource,
        "before.chemd": beforeDiffSource
      }
    );

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Diff format must be one of/);
  });

  it("rejects missing option values", async () => {
    const diffResult = await runInTempDir(["diff", "before.chemd", "after.chemd", "--format"], {
      "after.chemd": afterDiffSource,
      "before.chemd": beforeDiffSource
    });
    const changedResult = await runInTempDir(["changed", "--base"], {});

    expect(diffResult.exitCode).toBe(EXIT_USAGE);
    expect(diffResult.stderr).toMatch(/Option --format requires a value/);
    expect(changedResult.exitCode).toBe(EXIT_USAGE);
    expect(changedResult.stderr).toMatch(/Option --base requires a value/);
  });

  it("exits 1 when diff inputs have error diagnostics", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "after.chemd"], {
      "after.chemd": invalidKindSource,
      "before.chemd": invalidKindSource
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/before\.chemd/);
    expect(result.stderr).toMatch(/after\.chemd/);
    expect(result.stderr).toContain("E_CHEMD_KIND_CONFLICT");
  });
});

describe("chemd cli changed", () => {
  it("validates and diffs modified tracked chemd files", async () => {
    const gitRunner = createGitRunner({
      show: { "HEAD:tracked.chemd": beforeDiffSource },
      tracked: "M\0tracked.chemd\0"
    });
    const result = await runInTempDir(["changed"], {
      "tracked.chemd": afterDiffSource
    }, { gitRunner });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/Changed Chemd files against HEAD:/);
    expect(result.stdout).toMatch(/M tracked\.chemd/);
    expect(result.stdout).toMatch(/validation: 0 error\(s\)/);
    expect(result.stdout).toMatch(/semantic diff:/);
    expect(result.stdout).toMatch(/~ temperature: "25 C" -> "80 C"/);
  });

  it("writes JSON for modified tracked chemd files", async () => {
    const gitRunner = createGitRunner({
      show: { "main:tracked.chemd": beforeDiffSource },
      tracked: "M\0tracked.chemd\0"
    });
    const result = await runInTempDir(
      ["changed", "--base", "main", "--format", "json"],
      { "tracked.chemd": afterDiffSource },
      { gitRunner }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-changed/v0.1");
    expect(payload.base).toBe("main");
    expect(payload.files[0].path).toBe("tracked.chemd");
    expect(payload.files[0].validation.counts.error).toBe(0);
    expect(payload.files[0].diff.schemaVersion).toBe("chemd-semantic-diff/v0.1");
  });

  it("validates tracked added chemd files without base diff", async () => {
    const gitRunner = createGitRunner({ tracked: "A\0added.chemd\0" });
    const result = await runInTempDir(["changed", "--format", "json"], {
      "added.chemd": validSource
    }, { gitRunner });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.files[0].status).toBe("A");
    expect(payload.files[0].path).toBe("added.chemd");
    expect(payload.files[0].validation.counts.error).toBe(0);
    expect(payload.files[0].diff).toBeUndefined();
  });

  it("prints tracked added chemd files as new files", async () => {
    const gitRunner = createGitRunner({ tracked: "A\0added.chemd\0" });
    const result = await runInTempDir(["changed"], {
      "added.chemd": validSource
    }, { gitRunner });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/A added\.chemd/);
    expect(result.stdout).toMatch(/semantic diff: new file/);
  });

  it("diffs renamed tracked chemd files from the previous path", async () => {
    const gitRunner = createGitRunner({
      show: { "HEAD:old.chemd": beforeDiffSource },
      tracked: "R100\0old.chemd\0renamed.chemd\0"
    });
    const result = await runInTempDir(["changed", "--format", "json"], {
      "renamed.chemd": afterDiffSource
    }, { gitRunner });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.files[0].status).toBe("R");
    expect(payload.files[0].previousPath).toBe("old.chemd");
    expect(payload.files[0].diff.changes.length).toBeGreaterThan(0);
  });

  it("validates untracked chemd files without base diff", async () => {
    const gitRunner = createGitRunner({ untracked: "new.chemd\0" });
    const result = await runInTempDir(["changed"], {
      "new.chemd": validSource
    }, { gitRunner });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/\? new\.chemd/);
    expect(result.stdout).toMatch(/semantic diff: new file/);
  });

  it("exits 1 when a changed file has error diagnostics", async () => {
    const gitRunner = createGitRunner({
      show: { "HEAD:invalid.chemd": validSource },
      tracked: "M\0invalid.chemd\0"
    });
    const result = await runInTempDir(["changed"], {
      "invalid.chemd": invalidKindSource
    }, { gitRunner });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toMatch(/M invalid\.chemd/);
    expect(result.stdout).toMatch(/validation: 1 error\(s\)/);
  });

  it("rejects option-like changed base refs before invoking Git", async () => {
    const result = await runInTempDir(["changed", "--base=--cached"], {});

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/Changed base ref cannot start/);
  });

  it("reports Git runner failures without usage text", async () => {
    const gitRunner: GitRunner = () => ({
      status: null,
      stdout: "",
      stderr: ""
    });
    const result = await runInTempDir(["changed"], {}, { gitRunner });

    expect(result.exitCode).toBe(EXIT_USAGE);
    expect(result.stderr).toMatch(/git command failed/);
    expect(result.stderr).not.toContain("Usage:");
  });

  it("reports no changed chemd files", async () => {
    const result = await runInTempDir(["changed"], {}, {
      gitRunner: createGitRunner({})
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout.trim()).toBe("No changed Chemd files.");
  });

  it("keeps legacy .chemd.md files in changed-file discovery", async () => {
    const gitRunner = createGitRunner({ tracked: "A\0legacy.chemd.md\0" });
    const result = await runInTempDir(["changed", "--format", "json"], {
      "legacy.chemd.md": validSource
    }, { gitRunner });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.files[0].path).toBe("legacy.chemd.md");
  });
});
