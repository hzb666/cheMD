import { describe, expect, it } from "vitest";
import type { AgentRunDeclaration, ChemdReferenceExpr } from "@chemd/core";

import { buildCanonicalLnf } from "../src/index";
import { createProgram, declaration, refValue } from "./fixtures";

describe("canonical LNF builder", () => {
  it("builds program-native v1 source, entities, semantic links, workflow, and agent audit", () => {
    const lnf = buildCanonicalLnf({
      document: createProgram(),
      typedGraph: {
        documentId: "exp-lnf",
        nodes: [{
          kind: "reaction",
          nodeId: "rxn-main",
          sourceNodeType: "reaction",
          sourceMetadata: {
            sourceKind: "declaration",
            declarationKind: "reaction",
            declarationId: "rxn-main"
          },
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
        procedures: [{
          procedureId: "proc-main",
          structureHint: "explicit_steps",
          sourceType: "explicit_steps",
          steps: [],
          diagnostics: [],
          loweringConfidence: 1
        }],
        observations: [],
        diagnostics: [],
        steps: [{
          stepId: "s1",
          family: "cool",
          params: { target_temperature: "0 degC" },
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-main",
            sourceType: "explicit_step",
            rawText: "step cool"
          },
          loweringConfidence: 1
        }]
      },
      diagnostics: []
    });

    expect(lnf.schemaVersion).toBe("chemd-lnf/v1.0");
    expect(lnf.experiment.document).toMatchObject({
      id: "exp-lnf",
      moduleName: "lnf",
      sourceLanguage: "chemd/program-v1"
    });
    expect(lnf.experiment.source.declarationIndex).toContainEqual(expect.objectContaining({
      declarationId: "rxn-main",
      declarationKind: "reaction",
      docIds: ["doc-rxn-main"]
    }));
    expect(lnf.experiment.entities.reactions[0]).toMatchObject({
      declarationId: "rxn-main",
      fields: { solvent: { value: "THF" } },
      typedNode: {
        kind: "reaction",
        normalizedConditions: {
          solvent: {
            normalized: "tetrahydrofuran"
          }
        }
      }
    });
    expect(lnf.experiment.entities).toMatchObject({
      molecules: [{ declarationId: "mol-a" }],
      materials: [{ declarationId: "mat-a" }],
      batches: [{ declarationId: "batch-a" }],
      results: [{ declarationId: "result-main" }],
      analyses: [{ declarationId: "analysis-main" }],
      samples: [{ declarationId: "sample-main" }],
      artifacts: [{ declarationId: "artifact-main" }],
      conditionScreens: [{ declarationId: "screen-main" }]
    });
    expect(lnf.experiment.semantic.documentationLinks[0]).toMatchObject({
      docId: "doc-rxn-main",
      attachment: { kind: "declaration", declarationId: "rxn-main" }
    });
    expect(lnf.experiment.workflow).toMatchObject({
      procedures: [{ procedureId: "proc-main" }],
      traces: [{ declarationId: "trace-main" }],
      stepSources: {
        explicitStepIds: ["s1"],
        loweredStepIds: [],
        observationEvents: []
      }
    });
    expect(lnf.experiment.agent).toMatchObject({
      runs: [{ id: "agent-review", goal: "Review synthesis source." }],
      patches: [{ runId: "agent-review", patch: { id: "patch-1" } }],
      decisions: [{ runId: "agent-review", decision: { id: "decision-1" } }]
    });
    expect(lnf.experiment.quality.sourceCompleteness).toMatchObject({
      declarationCount: 11,
      documentationCount: 1,
      unresolvedReferenceCount: 0,
      incompleteDeclarationCount: 0,
      agentAuditRunCount: 1
    });
    expect("migration" in lnf.experiment.quality).toBe(false);
  });

  it("reports source completeness from unresolved references and declaration diagnostics", () => {
    const unresolvedRef = (raw: string, target: string): ChemdReferenceExpr =>
      refValue(raw, target, "unresolved") as ChemdReferenceExpr;
    const agentWithUnresolvedRefs: AgentRunDeclaration = {
      kind: "agent_run",
      id: "agent-unresolved",
      qualifiedId: "lnf.agent-unresolved",
      docs: [],
      goal: "Review missing refs.",
      status: "completed",
      toolCalls: [{
        kind: "tool",
        id: "tool-unresolved",
        name: "inspect",
        status: "ok",
        args: {
          target: refValue("@missing-tool-target", "missing-tool-target", "unresolved")
        }
      }],
      evidence: [{
        kind: "evidence",
        id: "evidence-unresolved",
        evidenceKind: "source",
        refs: [unresolvedRef("@missing-evidence", "missing-evidence")]
      }],
      patches: [{
        kind: "patch",
        id: "patch-unresolved",
        status: "proposed",
        edits: [{
          target: {
            kind: "declaration_field",
            declarationId: "rxn-main",
            field: "solvent"
          },
          value: refValue("@missing-patch-value", "missing-patch-value", "unresolved")
        }]
      }],
      decisions: [],
      auditTimeline: []
    };
    const lnf = buildCanonicalLnf({
      document: createProgram([
        declaration("result", "result-missing", {
          reaction: refValue("@missing-rxn", "missing-rxn", "unresolved")
        }),
        agentWithUnresolvedRefs
      ]),
      typedGraph: {
        documentId: "exp-lnf",
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
        steps: [{
          stepId: "s2",
          family: "observe",
          params: {},
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-main",
            sourceType: "lowered_step",
            rawText: "observe"
          },
          loweringConfidence: 0.7
        }]
      },
      diagnostics: [{
        code: "E_RESULT_REACTION_CONFLICT",
        severity: "error",
        message: "Result reaction is invalid.",
        sourceLayer: "typechecker",
        sourceNodeType: "result",
        sourceNodeId: "result-missing"
      }]
    });

    expect(lnf.experiment.workflow.stepSources).toEqual({
      explicitStepIds: [],
      loweredStepIds: ["s2"],
      observationEvents: [{ observationId: "obs-main", eventId: "obs-main::event-1" }]
    });
    expect(lnf.experiment.quality.sourceCompleteness).toMatchObject({
      declarationCount: 13,
      documentationCount: 1,
      unresolvedReferenceCount: 4,
      incompleteDeclarationCount: 1,
      agentAuditRunCount: 2
    });
  });

  it("preserves runtime summaries without legacy migration fields", () => {
    const lnf = buildCanonicalLnf({
      document: createProgram(),
      typedGraph: {
        documentId: "exp-lnf",
        nodes: [],
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
          source: {
            sourceNodeType: "procedure",
            sourceNodeId: "proc-main",
            sourceType: "explicit_step",
            rawText: "step add"
          },
          loweringConfidence: 1
        }]
      },
      diagnostics: [],
      runPlan: {
        planId: "runplan::exp-lnf",
        documentId: "exp-lnf",
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
            sourceNodeId: "proc-main",
            sourceType: "explicit_step",
            rawText: "step add"
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
        planId: "runplan::exp-lnf",
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
          timestamp: "2026-05-29T00:00:00.000Z",
          stepId: "s1"
        }]
      }
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
