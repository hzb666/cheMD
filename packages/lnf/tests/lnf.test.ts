import { describe, expect, it } from "vitest";

import { buildLnf, buildLnfV04 } from "../src/index";

describe("LNF builder", () => {
  it("builds a canonical machine view without inventing author syntax", () => {
    const lnf = buildLnf({
      document: {
        id: "exp-lnf",
        title: "LNF test",
        date: "2026-04-17"
      },
      typedGraph: {
        documentId: "exp-lnf",
        nodes: [{
          kind: "reaction",
          nodeId: "rxn-main",
          sourceNodeType: "reaction",
          syntaxOrigin: "chemd",
          declaredKind: "reaction",
          reactants: [],
          products: [],
          normalizedConditions: {
            solvent: {
              raw: "THF",
              normalized: "tetrahydrofuran"
            }
          }
        }],
        quantities: [],
        diagnostics: []
      },
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "cool",
            params: { target_temperature: "0 °C" },
            source: { sourceNodeType: "procedure", sourceNodeId: "proc-1", rawText: "冷却至 0 °C。" },
            loweringConfidence: 0.95
          }
        ]
      },
      diagnostics: []
    });

    expect(lnf.schemaVersion).toBe("chemd-lnf/v0.3");
    expect(lnf.experiment.procedure[0]).toMatchObject({
      family: "cool",
      params: { target_temperature: "0 °C" }
    });
    expect(lnf.experiment.reactions[0]).toMatchObject({
      syntaxOrigin: "chemd",
      declaredKind: "reaction",
      normalizedConditions: {
        solvent: {
          normalized: "tetrahydrofuran"
        }
      }
    });
  });

  it("builds v0.4 step source and migration summaries", () => {
    const lnf = buildLnfV04({
      document: {
        id: "exp-lnf-v04",
        title: "LNF v0.4 test",
        date: "2026-04-17"
      },
      typedGraph: {
        documentId: "exp-lnf-v04",
        nodes: [],
        quantities: [],
        diagnostics: []
      },
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "add",
            params: {},
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: add"
            },
            loweringConfidence: 1
          },
          {
            stepId: "s2",
            family: "observe",
            params: {},
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "lowered_step",
              rawText: "turned yellow"
            },
            loweringConfidence: 0.7
          }
        ]
      },
      diagnostics: [{
        code: "W_UNKNOWN_BLOCK",
        severity: "warning",
        message: "legacy block",
        sourceNodeType: "molecule",
        facts: { legacy_block_kind: "molecule" }
      }]
    });

    expect(lnf.schemaVersion).toBe("chemd-lnf/v0.4");
    expect(lnf.experiment.stepSources.explicit).toHaveLength(1);
    expect(lnf.experiment.stepSources.lowered).toHaveLength(1);
    expect(lnf.experiment.migration.legacyBlockCount).toBe(1);
  });
});

describe("LNF v0.4 semantic output", () => {
  it("builds v0.4 semantic graph and runtime trace summaries", () => {
    const lnf = buildLnfV04({
      document: {
        id: "exp-lnf-v04-semantic",
        title: "LNF v0.4 semantic test",
        date: "2026-04-18"
      },
      typedGraph: {
        documentId: "exp-lnf-v04-semantic",
        nodes: [{
          kind: "reaction",
          nodeId: "rxn-main",
          sourceNodeType: "reaction",
          reactants: [{ kind: "reference", targetKind: "molecule", refId: "mol-a", resolved: true }],
          products: [],
          normalizedConditions: {}
        }],
        quantities: [],
        diagnostics: []
      },
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [{
          stepId: "s1",
          family: "add",
          params: {},
          inputs: [{ raw: "@mol-a", reference: { kind: "reference", targetKind: "molecule", refId: "mol-a", resolved: true } }],
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-1",
            sourceType: "explicit_step",
            rawText: "step: add",
            provenance: {
              origin: "author",
              sourceNodeType: "step",
              sourceNodeId: "s1",
              ruleId: "parser.author.step",
              confidence: 1
            }
          },
          provenance: {
            origin: "author",
            sourceNodeType: "step",
            sourceNodeId: "s1",
            ruleId: "parser.author.step",
            confidence: 1
          },
          loweringConfidence: 1
        }]
      },
      diagnostics: [],
      runtimeState: {
        runId: "run-1",
        planId: "runplan::exp-lnf-v04-semantic",
        mode: "dry-run",
        status: "running",
        currentStepId: "s1",
        stepStates: [{ stepId: "s1", status: "running", diagnostics: [] }],
        resources: [],
        artifacts: [],
        observations: [],
        diagnostics: [],
        trace: [{
          traceId: "trace-1",
          type: "step_started",
          timestamp: "2026-04-18T00:00:00.000Z",
          stepId: "s1"
        }]
      }
    });

    expect(lnf.experiment.typedGraph.nodes[0]).toMatchObject({
      kind: "reaction",
      reactants: [{ kind: "reference", targetKind: "molecule", refId: "mol-a" }]
    });
    expect(lnf.experiment.stepGraph.steps[0]).toMatchObject({
      stepId: "s1",
      source: {
        provenance: {
          ruleId: "parser.author.step"
        }
      },
      inputs: [{ raw: "@mol-a", reference: { targetKind: "molecule" } }]
    });
    expect(lnf.experiment.runtimeSummary).toMatchObject({
      runId: "run-1",
      traceCount: 1,
      stepStates: [{ stepId: "s1", status: "running" }]
    });
  });
});
