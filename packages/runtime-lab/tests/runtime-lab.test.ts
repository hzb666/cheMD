import { describe, expect, it } from "vitest";

import {
  abortControl,
  buildRunPlan,
  completeControl,
  completeStep,
  confirmStep,
  createLabStateStack,
  createInitialLabState,
  enterControl,
  pushLabStateSnapshot,
  restoreCurrentLabStateSnapshot,
  restoreLabStateSnapshot,
  preflightRun,
  startStep
} from "../src/index";

describe("runtime lab planner", () => {
  it("builds a run plan and reports missing capabilities in preflight", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime",
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
            loweringConfidence: 0.92
          }
        ]
      }
    });
    const state = createInitialLabState(plan, { runId: "run-1" });
    const preflight = preflightRun(plan, { capabilities: [] });

    expect(plan.steps[0]).toMatchObject({
      requiredCapabilities: ["cooling"],
      status: "planned"
    });
    expect(state.status).toBe("planned");
    expect(preflight.blocking).toBe(true);
    expect(preflight.issues[0]).toMatchObject({
      code: "E_RUNTIME_CAPABILITY_MISSING",
      facts: {
        step_id: "s1",
        missing_capability: "cooling",
        mode: "dry-run"
      }
    });
    expect(preflight.diagnostics[0]?.code).toBe("E605");
    expect(preflight.diagnostics[0]?.facts).toMatchObject({
      runtime_issue_code: "E_RUNTIME_CAPABILITY_MISSING",
      missing_capability: "cooling"
    });
  });

  it("preserves step provenance and applies inferred-step confirmation", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-source",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "add",
            params: { materials: "A" },
            outputs: [{ raw: "intermediate" }],
            artifacts: [{ artifactId: "art-1", kind: "material" }],
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
            dependsOn: ["s1"],
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "lowered_step",
              rawText: "The mixture turned yellow."
            },
            loweringConfidence: 0.72
          }
        ]
      }
    });

    expect(plan.steps[0]).toMatchObject({
      confirmationStrategy: "manual_required",
      sourceType: "explicit_step",
      outputs: [{ raw: "intermediate" }],
      artifacts: [{ artifactId: "art-1", kind: "material" }]
    });
    expect(plan.steps[1]).toMatchObject({
      confirmationStrategy: "review_inferred",
      dependsOn: ["s1"],
      requiresConfirmation: true
    });
  });

  it("checks device range inventory dynamic controls and parallel resources in preflight", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-preflight",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s-heat",
            family: "heat",
            params: { target_temperature: "150 C", duration: "30 min" },
            inputs: [{ raw: "@mat-base" }],
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: heat"
            },
            loweringConfidence: 1
          }
        ],
        controls: [
          {
            controlId: "operator-approval",
            kind: "wait",
            params: { condition: "operator.confirmed" },
            controlPath: ["operator-approval"],
            dynamic: true,
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              rawText: "wait: operator-approval"
            }
          },
          {
            controlId: "parallel-workup",
            kind: "parallel",
            params: {},
            controlPath: ["parallel-workup"],
            dynamic: false,
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              rawText: "parallel: parallel-workup"
            }
          }
        ]
      }
    });
    const preflight = preflightRun(plan, {
      mode: "robot-run",
      capabilities: ["heating"],
      devices: [{ capability: "heating", min: 20, max: 80, unit: "C" }],
      inventory: { materials: [{ id: "mat-base", available: false }] },
      adapters: []
    });

    expect(preflight.blocking).toBe(true);
    expect(preflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "device_range", stepId: "s-heat", severity: "error" }),
      expect.objectContaining({ kind: "inventory", stepId: "s-heat", severity: "error" }),
      expect.objectContaining({ kind: "safety", stepId: "s-heat", severity: "error" }),
      expect.objectContaining({ kind: "control", controlId: "operator-approval", severity: "error" }),
      expect.objectContaining({ kind: "resource_conflict", controlId: "parallel-workup", severity: "error" })
    ]));
    expect(preflight.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "E_RUNTIME_DEVICE_RANGE",
      "E_RUNTIME_INVENTORY",
      "W_RUNTIME_SAFETY",
      "E_RUNTIME_CONTROL",
      "E_RUNTIME_RESOURCE_CONFLICT"
    ]));
  });

  it("applies safety rules for material hazards and control kinds", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-safety-rules",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s-add",
            family: "add",
            params: { materials: "@mat-acid" },
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: add"
            },
            loweringConfidence: 1
          }
        ],
        controls: [
          {
            controlId: "branch-ph",
            kind: "branch",
            params: {},
            controlPath: ["branch-ph"],
            dynamic: true,
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              rawText: "branch: branch-ph"
            }
          }
        ]
      }
    });
    const preflight = preflightRun(plan, {
      mode: "human-run",
      capabilities: [],
      inventory: {
        materials: [{ id: "mat-acid", available: true, hazards: ["acid"] }]
      },
      safetyRules: [
        {
          ruleId: "acid-review",
          trigger: { materialHazard: "acid" },
          severity: "warning",
          requiresConfirmation: true,
          message: "Acid handling requires review."
        },
        {
          ruleId: "branch-review",
          trigger: { controlKind: "branch" },
          severity: "warning",
          message: "Branch controls require operator review."
        }
      ]
    });

    expect(preflight.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "safety", stepId: "s-add", message: "Acid handling requires review." }),
      expect.objectContaining({ kind: "safety", controlId: "branch-ph", message: "Branch controls require operator review." })
    ]));
  });
});

describe("runtime lab state machine", () => {
  it("drives step status from confirmation and dependencies", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-state",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "add",
            params: { materials: "A" },
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
            family: "mix",
            params: {},
            dependsOn: ["s1"],
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: mix"
            },
            loweringConfidence: 1
          }
        ]
      }
    });
    const initialState = createInitialLabState(plan, { runId: "run-state", mode: "human-run" });
    const confirmedState = confirmStep(initialState, plan, "s1", { operatorId: "chemist-1" });
    const runningState = startStep(confirmedState, plan, "s1", { operatorId: "chemist-1" });
    const completedState = completeStep(runningState, plan, "s1", {
      operatorId: "chemist-1",
      artifacts: [{ artifactId: "art-1", kind: "material" }],
      observations: [{ observationId: "obs-1", rawText: "Clear solution." }]
    });

    expect(initialState.stepStates).toEqual([
      expect.objectContaining({ stepId: "s1", status: "waiting_confirmation" }),
      expect.objectContaining({ stepId: "s2", status: "planned" })
    ]);
    expect(confirmedState.stepStates[0]).toMatchObject({ stepId: "s1", status: "ready" });
    expect(runningState.stepStates[0]).toMatchObject({ stepId: "s1", status: "running" });
    expect(completedState.stepStates).toEqual([
      expect.objectContaining({ stepId: "s1", status: "completed" }),
      expect.objectContaining({ stepId: "s2", status: "ready" })
    ]);
    expect(completedState.artifacts).toEqual([
      expect.objectContaining({ artifactId: "art-1", linkedStepId: "s1" })
    ]);
    expect(completedState.observations).toEqual([
      expect.objectContaining({ observationId: "obs-1", linkedStepId: "s1" })
    ]);
    expect(completedState.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "operator_action", stepId: "s1" }),
        expect.objectContaining({ type: "step_started", stepId: "s1" }),
        expect.objectContaining({ type: "step_completed", stepId: "s1" }),
        expect.objectContaining({ type: "artifact_generated", stepId: "s1" }),
        expect.objectContaining({ type: "observation_recorded", stepId: "s1" })
      ])
    );
  });

  it("blocks robot-run preflight for unknown step families", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-unknown",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "teleport" as never,
            params: {},
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              rawText: "step: teleport"
            },
            loweringConfidence: 1
          }
        ]
      }
    });
    const preflight = preflightRun(plan, { mode: "robot-run", capabilities: [] });

    expect(preflight.blocking).toBe(true);
    expect(preflight.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_RUNTIME_UNKNOWN_STEP",
        severity: "error",
        sourceLayer: "runtime_preflight"
      })
    );
    expect(preflight.issues).toContainEqual(
      expect.objectContaining({
        code: "E_RUNTIME_UNKNOWN_STEP",
        kind: "adapter",
        stepId: "s1",
        severity: "error"
      })
    );
  });

  it("keeps a restorable runtime state stack", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-stack",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "add",
            params: { materials: "A" },
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: add"
            },
            loweringConfidence: 1
          }
        ]
      }
    });
    const initial = createInitialLabState(plan, { runId: "run-stack" });
    const stack = createLabStateStack(initial, {
      now: "2026-06-03T00:00:00.000Z",
      snapshotId: "snap-initial",
      reason: "initial"
    });
    const running = startStep(
      confirmStep(initial, plan, "s1"),
      plan,
      "s1"
    );
    const updated = pushLabStateSnapshot(stack, running, {
      now: "2026-06-03T00:01:00.000Z",
      snapshotId: "snap-running",
      reason: "started"
    });

    expect(updated.snapshots.map((snapshot) => snapshot.snapshotId)).toEqual([
      "snap-initial",
      "snap-running"
    ]);
    expect(restoreLabStateSnapshot(updated, "snap-initial")?.stepStates[0])
      .toMatchObject({ stepId: "s1", status: "waiting_confirmation" });
    expect(restoreCurrentLabStateSnapshot(updated)?.stepStates[0])
      .toMatchObject({ stepId: "s1", status: "running" });

    running.stepStates[0]!.status = "failed";
    expect(restoreCurrentLabStateSnapshot(updated)?.stepStates[0])
      .toMatchObject({ stepId: "s1", status: "running" });
  });

  it("drives dynamic control states and releases dependent steps", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-control",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "mix",
            params: {},
            dependsOn: ["operator_gate"],
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: mix"
            },
            loweringConfidence: 1
          }
        ],
        controls: [
          {
            controlId: "operator_gate",
            kind: "wait",
            params: { condition: "operator.confirmed" },
            controlPath: ["operator_gate"],
            dynamic: true,
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              rawText: "wait: operator_gate"
            }
          }
        ]
      }
    });
    const initialState = createInitialLabState(plan, { runId: "run-control" });
    const runningControl = enterControl(initialState, plan, "operator_gate", { operatorId: "chemist-1" });
    const completedControl = completeControl(runningControl, plan, "operator_gate", { operatorId: "chemist-1" });

    expect(initialState.controlStates[0]).toMatchObject({ controlId: "operator_gate", status: "waiting_adapter" });
    expect(initialState.stepStates[0]).toMatchObject({ stepId: "s1", status: "planned" });
    expect(runningControl.controlStates[0]).toMatchObject({ controlId: "operator_gate", status: "running" });
    expect(completedControl.controlStates[0]).toMatchObject({ controlId: "operator_gate", status: "completed" });
    expect(completedControl.stepStates[0]).toMatchObject({ stepId: "s1", status: "ready" });
    expect(completedControl.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "control_entered", controlId: "operator_gate" }),
      expect.objectContaining({ type: "control_completed", controlId: "operator_gate" })
    ]));
  });

  it("records runtime diagnostics for invalid control transitions", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-control-invalid",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [],
        controls: []
      }
    });
    const initialState = createInitialLabState(plan, { runId: "run-control-invalid" });
    const completedMissing = completeControl(initialState, plan, "missing_control");
    const abortedMissing = abortControl(initialState, plan, "missing_control");

    expect(completedMissing.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_RUNTIME_CONTROL",
      facts: expect.objectContaining({ control_id: "missing_control" })
    }));
    expect(abortedMissing.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_RUNTIME_CONTROL",
      facts: expect.objectContaining({ control_id: "missing_control" })
    }));
  });

  it("restores cloned runtime states from snapshots", () => {
    const plan = buildRunPlan({
      documentId: "exp-runtime-stack-clone",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "mix",
            params: {},
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: mix"
            },
            loweringConfidence: 1
          }
        ]
      }
    });
    const initial = createInitialLabState(plan, { runId: "run-stack-clone" });
    const stack = createLabStateStack(initial, { snapshotId: "snap-initial" });
    const restored = restoreLabStateSnapshot(stack, "snap-initial");
    const current = restoreCurrentLabStateSnapshot(stack);

    if (!restored || !current) {
      throw new Error("expected restorable snapshots");
    }
    restored.stepStates[0]!.status = "failed";
    current.stepStates[0]!.status = "running";

    expect(restoreLabStateSnapshot(stack, "snap-initial")?.stepStates[0]).toMatchObject({
      stepId: "s1",
      status: "ready"
    });
  });
});
