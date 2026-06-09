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
  formatGraphIndexText,
  runChemdCli
} from "./cli";
import type { GitRunner } from "./git-changed";

type CliRunOptions = NonNullable<Parameters<typeof runChemdCli>[1]>;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleAgentLoopDriverPath = path.join(packageRoot, "examples", "mock-agent-loop-driver.mjs");
const programGoldenFixture = readFileSync(
  path.join(packageRoot, "..", "compiler", "fixtures", "program-golden-suzuki-screen.chemd"),
  "utf8"
);

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

const validSource = `module exp_cli_valid

meta {
  id: "exp-cli-valid"
  title: "CLI Valid"
  date: "2026-04-19"
  primary_molecule: @mol_main
}

/// Main molecule.
molecule mol_main {
  name: "ethanol"
  smiles: "CCO"
}
`;

const invalidKindSource = `module exp_cli_invalid

meta {
  id: "exp-cli-invalid"
  title: "CLI Invalid"
  date: "2026-04-19"
}

INVALID_PROGRAM
`;

const fixableSource = `module exp_cli_fix

meta {
  id: "exp-cli-fix"
  title: "CLI Fix"
  date: "2026-04-24"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

result res_main {
  status: success
  yield: 72%
}

analysis ana_main {
  type: tlc
  notes: "one major spot"
}
`;

const fixNeedsInputSource = `module exp_cli_fix_input

meta {
  id: "exp-cli-fix-input"
  title: "CLI Fix Input"
  date: "2026-04-24"
}

reaction rxn_open {
  reactants: [substrate]
`;

const agentLoopNeedsRewriteSource = `module exp_cli_agent_bad

meta {
  id: "exp-cli-agent-bad"
  title: "CLI Agent Bad"
  date: "2026-04-24"
}

INVALID_PROGRAM
`;

const beforeDiffSource = `module exp_cli_diff

meta {
  id: "exp-cli-diff"
  title: "CLI Diff Before"
  date: "2026-04-19"
}

reaction rxn_main {
  reac: "CCO"
  prod: "CC=O"
  temperature: 25 C
}

result res_main for @rxn_main {
  yield: 23%
}

sample sample_old {
  name: "old sample"
}
`;

const afterDiffSource = `module exp_cli_diff

meta {
  id: "exp-cli-diff"
  title: "CLI Diff After"
  date: "2026-04-19"
}

reaction rxn_main {
  reac: "CCO"
  prod: "CC=O"
  temperature: 80 C
}

result res_main for @rxn_main {
  yield: 41%
}

analysis ana_new for @res_main {
  type: tlc
  result: "clean"
}
`;

const noExplicitIdBeforeSource = `module exp_cli_no_id

meta {
  id: "exp-cli-no-id"
  title: "CLI No ID Before"
  date: "2026-04-19"
}
`;

const noExplicitIdAfterSource = `module exp_cli_no_id

meta {
  id: "exp-cli-no-id"
  title: "CLI No ID After"
  date: "2026-04-19"
}
`;

const graphFamilyASource = `module exp_cli_graph_a

meta {
  id: "exp-cli-graph-a"
  title: "CLI Graph A"
  date: "2026-04-21"
}

reaction rxn_a {
  name: "esterification of acid A"
  reactants: ["acid-a", "alcohol"]
  products: ["ester-a"]
}

procedure proc_a for @rxn_a {
  step add_acid = add(materials: ["acid-a"])
  step add_alcohol = add(materials: ["alcohol"])
  step hold = hold(duration: 12 h)
  step concentrate = concentrate()
}
`;

const graphFamilyBSource = `module exp_cli_graph_b

meta {
  id: "exp-cli-graph-b"
  title: "CLI Graph B"
  date: "2026-04-23"
}

reaction rxn_b {
  name: "esterification of acid B"
  reactants: ["acid-b", "alcohol"]
  products: ["ester-b"]
}

procedure proc_b for @rxn_b {
  step add_acid = add(materials: ["acid-b"])
  step add_alcohol = add(materials: ["alcohol"])
  step hold = hold(duration: 12 h)
  step concentrate = concentrate()
}
`;

const preflightSource = `module exp_cli_preflight

meta {
  id: "exp-cli-preflight"
  title: "CLI Preflight"
  date: "2026-05-20"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

procedure proc_main for @rxn_main {
  step s_heat = heat(inputs: [@rxn_main], temperature: 80 C, duration: 30 min)
}
`;

const controlPreflightSource = `module exp_cli_control_preflight

meta {
  id: "exp-cli-control-preflight"
  title: "CLI Control Preflight"
  date: "2026-06-04"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

procedure proc_main for @rxn_main {
  branch branch_decision {
    case acidic(condition: "sensor.ph < 7") {
      step neutralize = add(materials: ["base"])
    }
    default {
      step hold = hold(duration: 10 min)
    }
  }

  parallel parallel_workup {
    path organic {
      step extract = extract(solvent: "EtOAc", depends_on: [hold])
    }
    path aqueous {
      step wash = wash(solvent: "brine", depends_on: [hold])
    }
  }
}
`;

const proseImportSource = "加入 n-BuLi 后体系逐渐变深红色。";
const proseImportPartialCoverageSource =
  "The organic phases were washed with brine, dried over Na2SO4, filtered, and concentrated under reduced pressure.";

const runInTempDir = async (
  argv: string[],
  files: Record<string, string>,
  options: CliRunOptions = {}
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

const parseProgramFields = (body: string): Record<string, unknown> =>
  Object.fromEntries(
    [...body.matchAll(/^\s*([A-Za-z_][\w-]*):\s*(.+)$/gm)]
      .map(([, key, value]) => [key, value.replace(/^"|"$/g, "")])
  );

const createProgramCompileResult = (source: string) => {
  const id = source.match(/id:\s*"([^"]+)"/)?.[1] ?? "exp-cli-mock";
  const moduleName = source.match(/^module\s+([A-Za-z_][\w]*)/m)?.[1] ?? "exp_cli_mock";
  const diagnostics = source.includes("INVALID_PROGRAM")
    ? [{
        code: "E_PROGRAM_DECLARATION_EXPECTED",
        severity: "error" as const,
        message: "Expected a program declaration."
      }]
    : [];
  const governanceDiagnostics = source.includes("PII_PROGRAM")
    ? [
        {
          code: "E_TRAINING_PII_PRESENT",
          message: "PII is present in the program.",
          severity: "error" as const
        },
        {
          code: "W_TRAINING_RAG_NOT_ALLOWED",
          message: "RAG reuse is not allowed.",
          severity: "warning" as const
        },
        {
          code: "W_TRAINING_AUDIT_ONLY",
          message: "Only audit reuse is allowed.",
          severity: "warning" as const
        }
      ]
    : [];
  const declarations = [...source.matchAll(
    /^(molecule|reaction|result|analysis|sample|procedure)\s+([A-Za-z_][\w]*)[^{]*\{([\s\S]*?)^}/gm
  )].map(([, kind, declarationId, body]) => ({
    docs: [],
    fields: parseProgramFields(body),
    id: declarationId,
    kind,
    qualifiedId: `${moduleName}.${declarationId}`
  }));
  const docs = [...source.matchAll(/^\/\/\/\s?(.*)$/gm)]
    .map(([, markdown], index) => ({
      attachment: { kind: "file" },
      id: `doc_${index + 1}`,
      markdown,
      type: "doc_comment"
    }));
  const program = {
    declarations,
    diagnostics,
    docs,
    imports: [],
    meta: {
      date: "2026-04-19",
      id,
      title: "CLI Program"
    },
    module: {
      docs: [],
      kind: "module",
      name: moduleName
    },
    schemaVersion: "chemd-program-ast/v1",
    sourceLanguage: "chemd/program-v1",
    type: "program_document"
  };

  return {
    authoringAssistance: {},
    declarations,
    diagnostics,
    docxBridge: "",
    docs,
    document: program,
    html: "",
    json: JSON.stringify({
      program: {
        schema_version: "chemd-program-json/v1",
        module: { name: moduleName },
        meta: {
          id,
          title: "CLI Program",
          date: "2026-04-19",
          fields: {},
          docs: []
        },
        imports: [],
        declarations: Object.fromEntries(
          declarations.map((declaration) => [declaration.id, {
            id: declaration.id,
            kind: declaration.kind
          }])
        ),
        documentation: Object.fromEntries(
          docs.map((doc) => [doc.id, {
            id: doc.id,
            markdown: doc.markdown
          }])
        ),
        agent_runs: {}
      },
      semantic: { typedGraph: {} },
      diagnostics
    }),
    lnf: { schemaVersion: "chemd-lnf/v1.0" },
    program,
    ragExport: {
      chunks: [{ id: `${id}:summary`, text: "program summary" }],
      governance: { allowed_uses: ["rag"] },
      schema_version: "chemd-rag-export/v0.1"
    },
    renderAdapterPayload: {},
    renderOptions: {},
    runPlan: {},
    runtimePreflight: {},
    stepGraph: {},
    trainingExport: {
      governance: { source: "workspace_policy" },
      quality_layer: {
        governance_quality: { diagnostics: governanceDiagnostics },
        training_quality: { review_required: source.includes("PII_PROGRAM"), review_reasons: [] }
      },
      schema_version: "chemd-training-export/v0.3",
      source_layer: { audit_only_fields: ["source_layer.raw_source"] }
    },
    trainingUnderstanding: {
      document: { document_id: id },
      governance: { allowed_uses: ["rag"] },
      schema_version: "chemd-training-understanding/v0.1"
    },
    typedSemanticGraph: {}
  } as never;
};

const programCliOptions = (): CliRunOptions => ({
  buildTrainingGraphIndex: () => ({
    edges: [],
    index_scope: {
      document_ids: ["exp-cli-graph-a", "exp-cli-graph-b"],
      sources: [
        { document_id: "exp-cli-graph-a", file_path: "graph-a.chemd" },
        { document_id: "exp-cli-graph-b", file_path: "graph-b.chemd" }
      ]
    },
    nodes: [],
    reaction_clusters: [
      {
        basis: "family_procedure",
        key: "esterification",
        member_reaction_entity_ids: ["rxn_a", "rxn_b"],
        reaction_family: "esterification"
      }
    ],
    reaction_features: [],
    reaction_similarity_edges: [
      {
        basis: ["same_family_procedure"],
        warnings: ["semantic_similarity_without_computed_fingerprint"]
      }
    ],
    schema_version: "chemd-training-graph-index/v0.1",
    warnings: []
  }) as never,
  compileChemd: createProgramCompileResult
});

const createMockSafeFix = (index: number) => ({
  diagnosticCode: "W_AUTHORING_FIX_AVAILABLE",
  fixId: `fix-${index}`,
  message: "Apply program authoring patch.",
  quickFix: {
    kind: "apply_authoring_patch",
    title: `Apply fix ${index}`
  },
  severity: "warning",
  sourceField: "ref",
  sourceNodeId: "res_main"
});

const createMockDiagnosis = (
  status: "clean" | "needs_author_input",
  safeFixCount: number
) => {
  const safeFixes = Array.from({ length: safeFixCount }, (_, index) => createMockSafeFix(index + 1));
  const requiredInputs = status === "needs_author_input"
    ? [{
        checklistId: "basic-experiment-record",
        description: "Reaction and result are required.",
        diagnostic: {
          code: "W_AUTHORING_INPUT_REQUIRED",
          message: "Missing authored facts.",
          severity: "warning"
        },
        inputId: "basic-experiment-record",
        missingItems: ["至少一个 result 声明"],
        title: "最小实验记录"
      }]
    : [];

  return {
    manualReviewItems: [],
    nextActions: status === "clean" ? ["accept"] : ["ask_for_required_inputs"],
    requiredInputs,
    safeFixes,
    status,
    summary: {
      errorCount: 0,
      infoCount: 0,
      manualReviewCount: 0,
      requiredInputCount: requiredInputs.length,
      safeFixCount: safeFixes.length,
      totalDiagnostics: requiredInputs.length + safeFixes.length,
      warningCount: requiredInputs.length + safeFixes.length
    }
  };
};

const createRepairLoopOptions = (input: {
  changed: boolean;
  finalSource: string;
  safeFixCount?: number;
  status: "clean" | "needs_author_input";
}): CliRunOptions => ({
  runChemdRepairLoop: (source, options) => {
    const baseResult = createProgramCompileResult(input.finalSource) as Record<string, unknown>;
    const finalResult = {
      ...baseResult,
      diagnosis: createMockDiagnosis(input.status, input.safeFixCount ?? 0)
    };
    const appliedSafeFixes = input.status === "clean"
      ? Array.from({ length: input.safeFixCount ?? 0 }, (_, index) => createMockSafeFix(index + 1))
      : [];

    return {
      changed: input.changed,
      finalResult,
      finalSource: input.finalSource,
      initialSource: source,
      iterations: [{
        appliedSafeFixes,
        compileResult: finalResult,
        iteration: 1
      }],
      maxIterations: options?.maxIterations ?? 5,
      stoppedReason: input.status,
      totalAppliedSafeFixes: appliedSafeFixes
    } as never;
  }
});

describe("chemd cli general commands", () => {
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
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/valid\.chemd: ok \(1 declaration\(s\), 1 doc comment\(s\)\)/);
    expect(result.stderr).toBe("");
  }, 10000);

  it("exits 1 when compiler diagnostics include an error", async () => {
    const result = await runInTempDir(["validate", "invalid.chemd"], {
      "invalid.chemd": invalidKindSource
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toMatch(/1 error\(s\)/);
    expect(result.stdout).toContain("E_PROGRAM_DECLARATION_EXPECTED");
  });

  it("applies deterministic safe fixes and prints the clean source in text mode", async () => {
    const finalSource = `${fixableSource}
result res_main for @rxn_main {
  status: success
}
`;
    const result = await runInTempDir(["fix", "fix.chemd"], {
      "fix.chemd": fixableSource
    }, createRepairLoopOptions({
      changed: true,
      finalSource,
      safeFixCount: 2,
      status: "clean"
    }));

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/final status: clean/);
    expect(result.stdout).toMatch(/safe fixes applied: 2/);
    expect(result.stdout).toContain("result res_main for @rxn_main");
    expect(result.stderr).toBe("");
  });

  it("accepts repair as a user-facing alias for deterministic fix", async () => {
    const finalSource = `${fixableSource}
result res_main for @rxn_main {
  status: success
}
`;
    const result = await runInTempDir(["repair", "fix.chemd"], {
      "fix.chemd": fixableSource
    }, createRepairLoopOptions({
      changed: true,
      finalSource,
      safeFixCount: 2,
      status: "clean"
    }));

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/Fix fix\.chemd/);
    expect(result.stdout).toMatch(/final status: clean/);
    expect(result.stdout).toContain("result res_main for @rxn_main");
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
        ...createRepairLoopOptions({
          changed: true,
          finalSource: `${fixableSource}
result res_main for @rxn_main {
  status: success
}
`,
          safeFixCount: 1,
          status: "clean"
        }),
        stderr,
        stdout
      });

      expect(exitCode).toBe(EXIT_OK);
      expect(stdout.value).toMatch(/wrote file: yes/);
      expect(readFileSync(filePath, "utf8")).toContain("result res_main for @rxn_main");
      expect(stderr.value).toBe("");
    }));

  it("emits a structured non-clean fix report when authored facts are still required", async () => {
    const result = await runInTempDir(
      ["fix", "fix-input.chemd", "--format", "json"],
      { "fix-input.chemd": fixNeedsInputSource },
      createRepairLoopOptions({
        changed: false,
        finalSource: fixNeedsInputSource,
        status: "needs_author_input"
      })
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

  it("exports program JSON output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "json"], {
      "valid.chemd": validSource
    }, programCliOptions());
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.program.schema_version).toBe("chemd-program-json/v1");
    expect(payload.program.meta.id).toBe("exp-cli-valid");
    expect(payload.program.declarations.mol_main).toMatchObject({ id: "mol_main" });
    expect(Object.keys(payload.program.documentation)).toHaveLength(1);
    expect(result.stderr).toBe("");
  });

  it("exits 1 and suppresses payload output when export input has errors", async () => {
    const result = await runInTempDir(["export", "invalid.chemd", "--format", "json"], {
      "invalid.chemd": invalidKindSource
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("E_PROGRAM_DECLARATION_EXPECTED");
  });

  it("exports canonical LNF output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format=lnf"], {
      "valid.chemd": validSource
    }, programCliOptions());
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-lnf/v1.0");
  });

  it("exports training output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "training"], {
      "valid.chemd": validSource
    }, programCliOptions());
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-understanding/v0.1");
    expect(payload.governance.allowed_uses).toContain("rag");
    expect(payload.source_layer).toBeUndefined();
  });

  it("exports RAG output", async () => {
    const result = await runInTempDir(["export", "valid.chemd", "--format", "rag"], {
      "valid.chemd": validSource
    }, programCliOptions());
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
    }, programCliOptions());
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-export/v0.3");
    expect(payload.governance.source).toBe("workspace_policy");
    expect(payload.source_layer.audit_only_fields).toContain("source_layer.raw_source");
    expect(payload.source_layer).toBeDefined();
  });

  it("exports real program training semantics without mocked compiler output", async () => {
    const result = await runInTempDir(["export", "program.chemd", "--format", "training-full"], {
      "program.chemd": programGoldenFixture
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.semantic_layer.reactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ original_id: "rxn_var1" })
    ]));
    expect(payload.semantic_layer.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ original_id: "res_var1", reaction_ref_raw: "@rxn_var1" })
    ]));
    expect(payload.semantic_layer.reactions).not.toEqual([]);
    expect(result.stderr).toBe("");
  }, 10000);

  it("reports training governance diagnostics through check --target training", async () => {
    const result = await runInTempDir(["check", "governance.chemd", "--target", "training", "--format", "json"], {
      "governance.chemd": `module exp_cli_governance

meta {
  id: "exp-cli-governance"
  title: "CLI Governance"
  date: "2026-05-20"
}

PII_PROGRAM

sample sample_main {
  name: "patient sample"
}
`
    }, programCliOptions());
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(payload.files[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_TRAINING_PII_PRESENT" }),
      expect.objectContaining({ code: "W_TRAINING_RAG_NOT_ALLOWED" })
    ]));
  });

  it("blocks non-audit training export when governance is blocking", async () => {
    const result = await runInTempDir(["export", "governance.chemd", "--format", "training"], {
      "governance.chemd": `module exp_cli_governance_export

meta {
  id: "exp-cli-governance-export"
  title: "CLI Governance Export"
  date: "2026-05-20"
}

PII_PROGRAM

sample sample_main {
  name: "patient sample"
}
`
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("E_TRAINING_PII_PRESENT");
    expect(result.stderr).toContain("W_TRAINING_AUDIT_ONLY");
  });

  it("fixes deterministic safe fixes through the user-facing command", async () => {
    const result = await runInTempDir(["fix", "fix.chemd"], {
      "fix.chemd": fixableSource
    }, createRepairLoopOptions({
      changed: true,
      finalSource: `${fixableSource}
result res_main for @rxn_main {
  status: success
}
`,
      safeFixCount: 2,
      status: "clean"
    }));

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/safe fixes applied: 2/);
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
      expect(readFileSync(path.join(dir, "exp.chemd"), "utf8")).toContain("condition_screen cv_screen");
      expect(newStderr.value).toBe("");
    }));

  it("imports prose to a Chemd draft in text mode", async () => {
    const result = await runInTempDir(["import", "prose", "procedure.txt"], {
      "procedure.txt": proseImportSource
    });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toContain("Prose import procedure.txt");
    expect(result.stdout).toContain("procedure import_procedure");
    expect(result.stdout).toContain("step s1 = add");
    expect(result.stdout).toContain("observation import_observation");
    expect(result.stdout).toContain("color_change");
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
    expect(result.stdout).toContain("step s1 = wash");
    expect(result.stdout).toContain("step s2 = dry");
    expect(result.stdout).toContain("step s3 = concentrate");
    expect(result.stdout).toContain("state snapshots:");
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
      expect(stdout.value).not.toContain("procedure import_procedure");
      expect(readFileSync(path.join(dir, "draft.chemd"), "utf8")).toContain(
        "procedure import_procedure"
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
    expect(payload.stateSnapshotCount).toBeGreaterThan(0);
    expect(payload.stateWarningCount).toBeGreaterThanOrEqual(0);
    expect(payload.observationCount).toBeGreaterThan(0);
    expect(payload.chemd).toContain("step s1 = add");
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
      },
      programCliOptions()
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

  it("exports workspace reaction edges as a training graph superset", async () => {
    const result = await runInTempDir(
      ["graph", "shared.chemd", "seed.chemd", "entry.chemd", "--format", "json"],
      {
        "shared.chemd": `module cli_shared

meta {
  id: "cli-shared"
  title: "CLI Shared"
  date: "2026-06-04"
}

molecule mol_halide {
  name: "aryl halide"
}

reaction_template tpl_suzuki {
  name: "Suzuki template"
}
`,
        "seed.chemd": `module cli_seed

import cli_shared as shared from "./shared.chemd"

meta {
  id: "cli-seed"
  title: "CLI Seed"
  date: "2026-06-04"
}

reaction rxn_seed {
  products: [@shared.mol_halide]
}
`,
        "entry.chemd": `module cli_entry

import cli_shared as shared from "./shared.chemd"
import cli_seed as seed from "./seed.chemd"

meta {
  id: "cli-entry"
  title: "CLI Entry"
  date: "2026-06-04"
}

reaction rxn_entry {
  template: @shared.tpl_suzuki
  prev: [@seed.rxn_seed]
  reactants: [@shared.mol_halide]
}

condition_screen screen_entry {
  reaction: @rxn_entry
  standard: @seed.rxn_seed
  factor: [temperature]
  outcome: [yield]
}
`
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schema_version).toBe("chemd-training-graph-index/v0.1");
    expect(payload.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge_type: "document_imports_document" }),
      expect.objectContaining({ edge_type: "reaction_precedes_reaction" }),
      expect.objectContaining({ edge_type: "reaction_instantiates_template" }),
      expect.objectContaining({ edge_type: "condition_screen_uses_standard" })
    ]));
    expect(result.stderr).toBe("");
  });

  it("exports runtime trace and state stack graph edges from a trace file", async () => {
    const result = await runInTempDir(
      ["graph", "runtime.chemd", "--trace", "trace.json", "--format", "json"],
      {
        "runtime.chemd": `module cli_runtime

meta {
  id: "cli-runtime"
  title: "CLI Runtime"
  date: "2026-06-04"
  primary_reaction: @rxn_runtime
}

reaction rxn_runtime {
  name: "Runtime reaction"
}

procedure proc_runtime for @rxn_runtime {
  step charge = add(material: "aryl halide")
  step heat = heat(temp: 90 C, duration: 2 h, depends_on: [charge])
  abort_if overheated(condition: "sensor.temperature > 130 C")
}
`,
        "trace.json": JSON.stringify({
          runId: "run-cli",
          stepIds: ["charge", "heat"],
          events: [
            {
              eventId: "evt-1",
              runId: "run-cli",
              timestamp: "2026-06-04T10:00:00.000Z",
              type: "run_started"
            },
            {
              eventId: "evt-2",
              runId: "run-cli",
              timestamp: "2026-06-04T10:01:00.000Z",
              type: "step_started",
              stepId: "charge"
            },
            {
              eventId: "evt-3",
              runId: "run-cli",
              timestamp: "2026-06-04T10:02:00.000Z",
              type: "control_entered",
              controlId: "overheated"
            }
          ]
        })
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "trace_event::run-cli::evt-2",
        node_type: "runtime_trace_event"
      }),
      expect.objectContaining({
        node_id: "runtime_state::run-cli::evt-2",
        node_type: "runtime_state_snapshot"
      })
    ]));
    expect(payload.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "trace_event_targets_step",
        from_node_id: "trace_event::run-cli::evt-2",
        to_node_id: "step::cli-runtime::proc_runtime::charge"
      }),
      expect.objectContaining({
        edge_type: "trace_event_targets_control",
        from_node_id: "trace_event::run-cli::evt-3",
        to_node_id: "control::cli-runtime::proc_runtime::overheated"
      }),
      expect.objectContaining({
        edge_type: "runtime_state_precedes_state",
        from_node_id: "runtime_state::run-cli::evt-1",
        to_node_id: "runtime_state::run-cli::evt-2"
      })
    ]));
    expect(result.stderr).toBe("");
  });

  it("formats reaction intelligence counts separately from semantic graph clusters", () => {
    const text = formatGraphIndexText({
      schema_version: "chemd-training-graph-index/v0.1",
      index_scope: {
        document_ids: ["exp-cli-graph-a"],
        sources: []
      },
      nodes: [],
      edges: [],
      reaction_features: [],
      reaction_clusters: [],
      reaction_similarity_edges: [],
      warnings: [],
      reaction_intelligence: {
        provider_statuses: [{ provider: "rdkit_fingerprint", status: "OK", warnings: [] }],
        strict_reaction_clusters: [{ cluster_id: "strict-a" }],
        candidate_reaction_neighbors: [{ edge_id: "candidate-a" }],
        semantic_reaction_groups: [{ group_id: "semantic-a" }],
        strict_reaction_cluster_profiles: [{ profile_id: "profile-a" }],
        warnings: ["provider_skipped:rxnfp"]
      }
    });

    expect(text).toContain("programs: 1");
    expect(text).toContain("semantic reaction clusters: 0");
    expect(text).toContain("semantic reaction similarity edges: 0");
    expect(text).toContain("reaction intelligence:");
    expect(text).toContain("strict reaction clusters: 1");
    expect(text).toContain("candidate reaction neighbors: 1");
    expect(text).toContain("semantic reaction groups: 1");
    expect(text).toContain("strict cluster profiles: 1");
    expect(text).toContain("warnings: provider_skipped:rxnfp");
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
      writeFileSync(path.join(dir, "fixtures", "valid", "alias.chemd"), `module exp_check_valid

meta {
  id: "exp-check-valid"
  title: "Check valid"
  date: "2026-05-20"
}

molecule substrate {
  smiles: "CCO"
}

reaction rxn_main {
  reac: @substrate
  prod: "product"
}
`);
      writeFileSync(path.join(dir, "fixtures", "invalid", "bad.chemd"), `module exp_check_invalid

meta {
  id: "exp-check-invalid"
  title: "Check invalid"
  date: "2026-05-20"
}

INVALID_PROGRAM
`);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "check",
        "fixtures",
        "--format",
        "json",
        "--dry-run"
      ], { cwd: dir, stderr, stdout, ...programCliOptions() });
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
        code: "E_PROGRAM_DECLARATION_EXPECTED",
        severity: "error"
      });
      expect(payload.codes).toMatchObject({
        E_PROGRAM_DECLARATION_EXPECTED: 1
      });
      expect(payload.files[0].codes).toMatchObject({
        E_PROGRAM_DECLARATION_EXPECTED: 1
      });
      expect(payload.files[1].program).toEqual({ declarationCount: 2, docCount: 0 });
      expect(stderr.value).toBe("");
    }));

  it("links multiple modules through the CLI", async () =>
    withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "entry.chemd"), `module exp_entry

import shared_solvents as solvents from "./shared.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

result res_entry for @solvents.rxn_shared {
  yield: 78%
}
`);
      writeFileSync(path.join(dir, "shared.chemd"), `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "link",
        "entry.chemd",
        "shared.chemd",
        "--changed",
        "shared.chemd",
        "--format",
        "json"
      ], { cwd: dir, stderr, stdout });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_OK);
      expect(payload).toMatchObject({
        schemaVersion: "chemd-link/v0.1",
        entry: { moduleName: "exp_entry" },
        totals: { error: 0 }
      });
      expect(payload.importGraph.edges).toEqual([
        expect.objectContaining({
          fromModule: "exp_entry",
          toModule: "shared_solvents",
          status: "resolved"
        })
      ]);
      expect(payload.affectedModules).toEqual(["shared_solvents", "exp_entry"]);
      expect(payload.buildGraph.dependents).toContainEqual({
        moduleName: "shared_solvents",
        dependents: ["exp_entry"]
      });
      expect(payload.modules[0]).toMatchObject({
        graph: expect.objectContaining({
          nodeCount: expect.any(Number)
        })
      });
      expect(payload.modules[0].typedSemanticGraph).toBeUndefined();
      expect(payload.modules[0].references).toContainEqual(
        expect.objectContaining({
          refId: "shared_solvents.rxn_shared",
          targetKind: "reaction",
          resolved: true
        })
      );
      expect(stderr.value).toBe("");
    }));

  it("prints link diagnostics in CLI text output", async () =>
    withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "entry.chemd"), `module exp_entry

import shared_solvents as solvents from "./shared.chemd"

meta {
  id: "exp-entry"
  title: "Entry"
  date: "2026-06-04"
}

result res_entry for @solvents.missing_rxn {
  yield: 78%
}
`);
      writeFileSync(path.join(dir, "shared.chemd"), `module shared_solvents

meta {
  id: "shared-solvents"
  title: "Shared"
  date: "2026-06-04"
}

reaction rxn_shared {
  name: "shared"
}
`);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "link",
        "entry.chemd",
        "shared.chemd"
      ], { cwd: dir, stderr, stdout });

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(stdout.value).toContain("diagnostics:");
      expect(stdout.value).toContain("error E_MODULE_SYMBOL_NOT_FOUND");
      expect(stdout.value).toContain("Unable to find symbol missing_rxn in module shared_solvents");
      expect(stderr.value).toBe("");
    }));

  it("exposes incremental compile cache status through the CLI", async () => {
    const result = await runInTempDir(["incremental", "valid.chemd", "valid.chemd", "--format", "json"], {
      "valid.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload).toMatchObject({
      schemaVersion: "chemd-incremental/v0.1",
      results: [
        expect.objectContaining({ cache: expect.objectContaining({ status: "cold" }) }),
        expect.objectContaining({ cache: expect.objectContaining({ status: "hit" }) })
      ]
    });
    expect(result.stderr).toBe("");
  });

  it("prints incremental diagnostics in CLI text output", async () => {
    const result = await runInTempDir(["incremental", "invalid.chemd"], {
      "invalid.chemd": invalidKindSource
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toContain("diagnostics:");
    expect(result.stdout).toContain("error E_PROGRAM_DECLARATION_EXPECTED");
    expect(result.stderr).toBe("");
  });

  it("keeps incremental CLI cache entries scoped by file path", async () => {
    const result = await runInTempDir(["incremental", "first.chemd", "second.chemd", "--format", "json"], {
      "first.chemd": validSource,
      "second.chemd": validSource
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.results).toEqual([
      expect.objectContaining({ cache: expect.objectContaining({ status: "cold" }) }),
      expect.objectContaining({ cache: expect.objectContaining({ status: "changed" }) })
    ]);
    expect(payload.results[0].cache.cacheKey).not.toBe(payload.results[1].cache.cacheKey);
    expect(result.stderr).toBe("");
  });

  it("prints source-aware language diagnostics in check text output", async () => {
    const result = await runInTempDir(["check", "invalid-control.chemd"], {
      "invalid-control.chemd": `module exp_cli_invalid_control

meta {
  id: "exp-cli-invalid-control"
  date: "2026-06-04"
}

procedure proc_main {
  repeat bad_repeat(count: 0) {
  }

  wait wait_bad
}
`
    });

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toContain(
      "invalid-control.chemd:3:1 error E_PROGRAM_META_FIELD_REQUIRED [typechecker meta#exp-cli-invalid-control field=title]"
    );
    expect(result.stdout).toContain(
      "E_PROCEDURE_CONTROL_COUNT [typechecker procedure#proc_main field=repeat]"
    );
    expect(result.stdout).toContain(
      "E_PROCEDURE_CONTROL_CONDITION [typechecker procedure#proc_main field=wait]"
    );
    expect(result.stderr).toBe("");
  });

  it("explains diagnostic codes through the CLI", async () => {
    const jsonResult = await runInTempDir([
      "explain",
      "E_PROCEDURE_STATE_INVALID",
      "--format",
      "json"
    ], {});
    const payload = JSON.parse(jsonResult.stdout);

    expect(jsonResult.exitCode).toBe(EXIT_OK);
    expect(payload).toMatchObject({
      schemaVersion: "chemd-diagnostic-explain/v0.1",
      explanation: {
        band: "procedure",
        code: "E_PROCEDURE_STATE_INVALID",
        known: true
      }
    });

    const textResult = await runInTempDir(["explain", "E_DOES_NOT_EXIST"], {});
    expect(textResult.exitCode).toBe(EXIT_USAGE);
    expect(textResult.stdout).toContain("unknown diagnostic code: E_DOES_NOT_EXIST");
  });

  it("summarizes language diagnostic codes in check JSON output", async () => {
    const result = await runInTempDir(["check", "invalid-control.chemd", "--format", "json"], {
      "invalid-control.chemd": `module exp_cli_invalid_control_json

meta {
  id: "exp-cli-invalid-control-json"
  date: "2026-06-04"
}

procedure proc_main {
  until bad_until {
    step observe_1 = observe()
  }
}
`
    });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(payload.codes).toMatchObject({
      E_PROGRAM_META_FIELD_REQUIRED: 1,
      E_PROCEDURE_CONTROL_CONDITION: 1,
      W_PROCEDURE_CONTROL_DYNAMIC: 1
    });
    expect(payload.files[0].diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_PROCEDURE_CONTROL_CONDITION",
        sourceLayer: "typechecker",
        sourceNodeType: "procedure",
        sourceNodeId: "proc_main",
        sourceField: "until"
      })
    ]));
    expect(result.stderr).toBe("");
  });

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
            expect.objectContaining({ kind: "device_range", stepId: "s_heat" })
          ])
        }
      });
      expect(payload.preflight.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "E_RUNTIME_DEVICE_RANGE" })
      ]));
      expect(stderr.value).toBe("");
    }));

  it("prints runtime preflight issue codes for source-level controls", async () =>
    withTempDir(async (dir) => {
      writeFileSync(path.join(dir, "control.chemd"), controlPreflightSource);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "preflight",
        "control.chemd",
        "--mode",
        "robot-run"
      ], { cwd: dir, stderr, stdout });

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(stdout.value).toContain("error E_RUNTIME_CONTROL_DYNAMIC control branch_decision");
      expect(stdout.value).toContain("error E_RUNTIME_RESOURCE_CONFLICT resource_conflict parallel_workup");
      expect(stderr.value).toBe("");
    }));
});

describe("chemd cli agent loop", () => {
  it("runs agent-loop through an external driver and emits a clean JSON report", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent.chemd");
      writeFileSync(filePath, agentLoopNeedsRewriteSource);

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
        note: "rewrite to program result and analysis"
      });
      expect(payload.finalSource).toContain("analysis ana_main for @res_main");
      expect(stderr.value).toBe("");
    }));

  it("passes compact diagnosis text to external agent-loop drivers", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-diagnosis.chemd");
      const driverPath = path.join(dir, "diagnosis-driver.mjs");
      writeFileSync(filePath, agentLoopNeedsRewriteSource);
      writeFileSync(driverPath, `
import { readFileSync } from "node:fs";

const request = JSON.parse(readFileSync(0, "utf8"));
const hasDiagnosisText = typeof request.diagnosisText === "string"
  && request.diagnosisText.includes("Compiler status:")
  && request.diagnosisText.includes("Manual review:");

process.stdout.write(JSON.stringify({
  schemaVersion: "chemd-agent-driver-response/v0.1",
  action: "stop",
  note: hasDiagnosisText ? "has diagnosisText" : "missing diagnosisText"
}));
`);

      const stdout = createWriter();
      const stderr = createWriter();
      const exitCode = await runChemdCli([
        "agent-loop",
        "agent-diagnosis.chemd",
        "--driver",
        process.execPath,
        "--driver-arg",
        driverPath,
        "--format",
        "json"
      ], {
        cwd: dir,
        stderr,
        stdout
      });
      const payload = JSON.parse(stdout.value);

      expect(exitCode).toBe(EXIT_VALIDATION_FAILED);
      expect(payload.iterations[0].agentResponse).toMatchObject({
        action: "stop",
        changedSource: false,
        note: "has diagnosisText"
      });
      expect(stderr.value).toBe("");
    }));

  it("writes the final clean source back to disk when agent-loop uses --write", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-write.chemd");
      writeFileSync(filePath, agentLoopNeedsRewriteSource);

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
      expect(readFileSync(filePath, "utf8")).toContain("result res_main for @rxn_main");
      expect(stderr.value).toBe("");
    }));

  it("returns unresolved diagnosis when the external driver declines to rewrite", async () =>
    withTempDir(async (dir) => {
      const filePath = path.join(dir, "agent-stop.chemd");
      writeFileSync(filePath, agentLoopNeedsRewriteSource);

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
      expect(payload.stoppedReason).toBe("manual_review");
      expect(payload.finalDiagnosis.status).toBe("manual_review");
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
      writeFileSync(filePath, agentLoopNeedsRewriteSource);

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
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/~ reaction #rxn_main/);
    expect(result.stdout).toMatch(/~ fields\.temperature: .*25 C.*80 C/);
    expect(result.stdout).toMatch(/~ result #res_main/);
    expect(result.stdout).toMatch(/~ fields\.yield: .*23%.*41%/);
    expect(result.stdout).toMatch(/\+ analysis #ana_new/);
    expect(result.stdout).toMatch(/- sample #sample_old/);
  });

  it("writes JSON semantic diff changes", async () => {
    const result = await runInTempDir(
      ["diff", "before.chemd", "after.chemd", "--format", "json"],
      {
        "after.chemd": afterDiffSource,
        "before.chemd": beforeDiffSource
      },
      programCliOptions()
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.schemaVersion).toBe("chemd-semantic-diff/v0.1");
    expect(payload.changes.map(
      (change: { changeType: string; nodeType: string; nodeId: string }) =>
        `${change.changeType}:${change.nodeType}:${change.nodeId}`
    )).toEqual([
      "removed:sample:sample_old",
      "added:analysis:ana_new",
      "changed:reaction:rxn_main",
      "changed:result:res_main"
    ]);
  });

  it("includes typed graph and run plan changes in semantic diff JSON", async () => {
    const before = `module exp_cli_runtime_diff

meta {
  id: "exp-cli-runtime-diff"
  title: "Runtime Diff"
  date: "2026-06-04"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

procedure proc_main for @rxn_main {
  step hold = hold(inputs: [@rxn_main], duration: 5 min)
}
`;
    const after = before.replace("duration: 5 min", "duration: 10 min");
    const result = await runInTempDir(
      ["diff", "before.chemd", "after.chemd", "--format", "json"],
      {
        "after.chemd": after,
        "before.chemd": before
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changeType: "changed",
        nodeId: "hold",
        nodeType: "typed:step"
      }),
      expect.objectContaining({
        changeType: "changed",
        nodeId: "hold",
        nodeType: "run_step"
      })
    ]));
  });

  it("includes control conditions and procedure state snapshots in semantic diff JSON", async () => {
    const before = `module exp_cli_state_diff

meta {
  id: "exp-cli-state-diff"
  title: "State Diff"
  date: "2026-06-04"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

procedure proc_main for @rxn_main {
  step charge = charge(materials: "substrate", solvent: "THF")
  wait operator_gate(condition: "operator.confirmed")
  step heat = heat(temperature: 80 C, duration: 1 h)
}
`;
    const after = before
      .replace("operator.confirmed", "sensor.temperature < 90 C")
      .replace("temperature: 80 C", "temperature: 90 C");
    const result = await runInTempDir(
      ["diff", "before.chemd", "after.chemd", "--format", "json"],
      {
        "after.chemd": after,
        "before.chemd": before
      }
    );
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        changeType: "changed",
        nodeId: "proc_main.operator_gate",
        nodeType: "control"
      }),
      expect.objectContaining({
        changeType: "changed",
        nodeId: "proc_main.heat",
        nodeType: "procedure_state_step"
      })
    ]));
  });

  it("ignores objects without explicit IDs in semantic diff", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "after.chemd"], {
      "after.chemd": noExplicitIdAfterSource,
      "before.chemd": noExplicitIdBeforeSource
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout.trim()).toBe("No semantic changes.");
  });

  it("reports no semantic changes", async () => {
    const result = await runInTempDir(["diff", "before.chemd", "same.chemd"], {
      "before.chemd": beforeDiffSource,
      "same.chemd": beforeDiffSource
    }, programCliOptions());

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
    }, programCliOptions());

    expect(result.exitCode).toBe(EXIT_VALIDATION_FAILED);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/before\.chemd/);
    expect(result.stderr).toMatch(/after\.chemd/);
    expect(result.stderr).toContain("E_PROGRAM_DECLARATION_EXPECTED");
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
    }, { ...programCliOptions(), gitRunner });

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.stdout).toMatch(/Changed Chemd files against HEAD:/);
    expect(result.stdout).toMatch(/M tracked\.chemd/);
    expect(result.stdout).toMatch(/validation: 0 error\(s\)/);
    expect(result.stdout).toMatch(/semantic diff:/);
    expect(result.stdout).toMatch(/~ fields\.temperature: .*25 C.*80 C/);
  });

  it("writes JSON for modified tracked chemd files", async () => {
    const gitRunner = createGitRunner({
      show: { "main:tracked.chemd": beforeDiffSource },
      tracked: "M\0tracked.chemd\0"
    });
    const result = await runInTempDir(
      ["changed", "--base", "main", "--format", "json"],
      { "tracked.chemd": afterDiffSource },
      { ...programCliOptions(), gitRunner }
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
    }, { ...programCliOptions(), gitRunner });
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
    }, { ...programCliOptions(), gitRunner });

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
    }, { ...programCliOptions(), gitRunner });
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
    }, { ...programCliOptions(), gitRunner });

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
    }, { ...programCliOptions(), gitRunner });

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

  it("reports changed files only for .chemd sources", async () => {
    const gitRunner = createGitRunner({ tracked: "A\0ignored.chemd.md\0" });
    const result = await runInTempDir(["changed", "--format", "json"], {
      "ignored.chemd.md": validSource
    }, { ...programCliOptions(), gitRunner });
    const payload = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(payload.files).toEqual([]);
  });
});
