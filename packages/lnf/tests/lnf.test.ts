import { describe, expect, it } from "vitest";

import { buildCanonicalLnf } from "../src/index";

describe("canonical LNF builder", () => {
  it("builds compact entities and workflow steps without inventing author syntax", () => {
    const lnf = buildCanonicalLnf({
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
          prev: [],
          next: [],
          reactants: [],
          products: [],
          participants: [],
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
        steps: [{
          stepId: "s1",
          family: "cool",
          params: { target_temperature: "0 °C" },
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-1",
            rawText: "冷却至 0 °C。"
          },
          loweringConfidence: 0.95
        }]
      },
      diagnostics: []
    });

    expect(lnf.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(lnf.experiment.workflow.steps[0]).toMatchObject({
      family: "cool",
      params: { target_temperature: "0 °C" }
    });
    expect(lnf.experiment.entities.reactions[0]).toMatchObject({
      syntaxOrigin: "chemd",
      declaredKind: "reaction",
      normalizedConditions: {
        solvent: {
          normalized: "tetrahydrofuran"
        }
      }
    });
  });

  it("indexes explicit/lowered source ids and reports syntax summary counts", () => {
    const lnf = buildCanonicalLnf({
      document: {
        id: "exp-lnf-source",
        title: "Canonical LNF source test",
        date: "2026-04-17"
      },
      typedGraph: {
        documentId: "exp-lnf-source",
        nodes: [],
        quantities: [],
        diagnostics: []
      },
      stepGraph: {
        procedures: [],
        observations: [{
          observationId: "obs-main",
          events: [{
            eventId: "obs-main::event-1",
            observationId: "obs-main",
            eventType: "color_change",
            rawText: "turned yellow",
            source: {
              sourceNodeType: "observation",
              sourceNodeId: "obs-main",
              sourceType: "explicit_observation",
              rawText: "turned yellow"
            },
            confidence: 0.9
          }],
          diagnostics: []
        }],
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
        code: "W_CHEMD_KIND_AMBIGUOUS",
        severity: "error",
        message: "chemd kind cannot be inferred",
        sourceNodeType: "chemd"
      }]
    });

    expect(lnf.experiment.workflow.stepSources).toEqual({
      explicitStepIds: ["s1"],
      loweredStepIds: ["s2"],
      observationEvents: [{ observationId: "obs-main", eventId: "obs-main::event-1" }]
    });
    expect(lnf.experiment.quality.migration.legacyBlockCount).toBe(0);
    expect(lnf.experiment.quality.migration.missingKindCount).toBe(1);
  });

  it("preserves semantic graph, step provenance, and runtime summaries", () => {
    const lnf = buildCanonicalLnf({
      document: {
        id: "exp-lnf-runtime",
        title: "Canonical LNF runtime test",
        date: "2026-04-18"
      },
      typedGraph: {
        documentId: "exp-lnf-runtime",
        nodes: [{
          kind: "reaction",
          nodeId: "rxn-main",
          sourceNodeType: "reaction",
          prev: [],
          next: [],
          reactants: [{
            kind: "reference",
            targetKind: "molecule",
            refId: "mol-a",
            resolved: true
          }],
          products: [],
          participants: [{
            id: "rxn-main.reactant.1",
            role: "reactant",
            raw: "@mol-a",
            reference: {
              kind: "reference",
              targetKind: "molecule",
              refId: "mol-a",
              resolved: true
            }
          }],
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
          inputs: [{
            raw: "@mol-a",
            reference: {
              kind: "reference",
              targetKind: "molecule",
              refId: "mol-a",
              resolved: true
            }
          }],
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
      runPlan: {
        planId: "runplan::exp-lnf-runtime",
        documentId: "exp-lnf-runtime",
        status: "planned",
        diagnostics: [],
        controls: [],
        controlStates: [],
        steps: [{
          stepId: "s1",
          order: 1,
          family: "add",
          params: {},
          status: "planned",
          requiredCapabilities: [],
          requiresConfirmation: true,
          confirmationStrategy: "manual_required",
          safetyTags: [],
          sourceType: "explicit_step",
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-1",
            sourceType: "explicit_step",
            rawText: "step: add"
          }
        }]
      },
      runtimePreflight: {
        blocking: false,
        issues: [],
        diagnostics: []
      },
      runtimeState: {
        runId: "run-1",
        planId: "runplan::exp-lnf-runtime",
        mode: "dry-run",
        status: "running",
        currentStepId: "s1",
        stepStates: [{ stepId: "s1", status: "running", diagnostics: [] }],
        controlStates: [],
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

    expect(lnf.experiment.semantic.typedGraph.nodes[0]).toMatchObject({
      kind: "reaction",
      reactants: [{ kind: "reference", targetKind: "molecule", refId: "mol-a" }]
    });
    expect(lnf.experiment.workflow.steps[0]).toMatchObject({
      stepId: "s1",
      source: {
        provenance: {
          ruleId: "parser.author.step"
        }
      },
      inputs: [{ raw: "@mol-a", reference: { targetKind: "molecule" } }]
    });
    expect(lnf.experiment.runtime?.planSummary?.steps[0]).toMatchObject({
      stepId: "s1",
      confirmationStrategy: "manual_required"
    });
    expect(lnf.experiment.runtime?.preflight?.blocking).toBe(false);
    expect(lnf.experiment.runtime?.stateSummary).toMatchObject({
      runId: "run-1",
      traceCount: 1,
      stepStates: [{ stepId: "s1", status: "running" }]
    });
  });
});
