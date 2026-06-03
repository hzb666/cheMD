import { describe, expect, it } from "vitest";

import {
  buildRunPlan,
  completeStep,
  confirmStep,
  createInitialLabState,
  startStep
} from "@chemd/runtime-lab";

import {
  adaptRuntimeLabTraceEvents,
  createTraceEvent,
  replayTrace,
  replayTraceToLabState
} from "../src/index";

describe("runtime trace replay", () => {
  it("replays completed step events without mutating source plans", () => {
    const events = [
      createTraceEvent({
        eventId: "evt-1",
        runId: "run-1",
        timestamp: "2026-04-17T00:00:00.000Z",
        type: "run_started"
      }),
      createTraceEvent({
        eventId: "evt-2",
        runId: "run-1",
        timestamp: "2026-04-17T00:00:01.000Z",
        type: "step_completed",
        stepId: "s1"
      })
    ];

    const replay = replayTrace({
      runId: "run-1",
      stepIds: ["s1"],
      events
    });

    expect(replay.completedStepIds).toEqual(["s1"]);
    expect(replay.status).toBe("completed");
  });

  it("tracks artifacts, manual overrides, unknown steps, and order violations", () => {
    const events = [
      createTraceEvent({
        eventId: "evt-1",
        runId: "run-2",
        timestamp: "2026-04-17T00:00:00.000Z",
        type: "analysis_recorded",
        stepId: "s2",
        payload: {
          analysisId: "ana-1",
          linkedStepId: "s2",
          artifactIds: ["art-1"]
        }
      }),
      createTraceEvent({
        eventId: "evt-2",
        runId: "run-2",
        timestamp: "2026-04-17T00:00:01.000Z",
        type: "step_completed",
        stepId: "s2"
      }),
      createTraceEvent({
        eventId: "evt-3",
        runId: "run-2",
        timestamp: "2026-04-17T00:00:02.000Z",
        type: "manual_override",
        stepId: "missing-step",
        payload: {
          reason: "operator corrected inferred step"
        }
      })
    ];

    const replay = replayTrace({
      runId: "run-2",
      stepIds: ["s1", "s2"],
      events
    });

    expect(replay.artifactIds).toEqual(["art-1"]);
    expect(replay.manualOverrideCount).toBe(1);
    expect(replay.unknownStepIds).toEqual(["missing-step"]);
    expect(replay.orderViolations).toEqual([{ stepId: "s2", expectedPreviousStepId: "s1" }]);
  });

  it("does not count unknown completed steps toward run completion", () => {
    const replay = replayTrace({
      runId: "run-unknown",
      stepIds: ["s1"],
      events: [
        createTraceEvent({
          eventId: "evt-unknown",
          runId: "run-unknown",
          timestamp: "2026-04-17T00:00:00.000Z",
          type: "step_completed",
          stepId: "bogus"
        })
      ]
    });

    expect(replay.completedStepIds).toEqual([]);
    expect(replay.unknownStepIds).toEqual(["bogus"]);
    expect(replay.status).toBe("running");
  });

  it("adapts runtime-lab artifact and observation trace events for replay", () => {
    const plan = buildRunPlan({
      documentId: "trace-adapter",
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
    const initial = createInitialLabState(plan, { runId: "run-adapt" });
    const confirmed = confirmStep(initial, plan, "s1", { operatorId: "chemist-1" });
    const running = startStep(confirmed, plan, "s1", { operatorId: "chemist-1" });
    const completed = completeStep(running, plan, "s1", {
      operatorId: "chemist-1",
      artifacts: [{ artifactId: "art-1", kind: "material" }],
      observations: [{ observationId: "obs-1", rawText: "Clear solution." }]
    });
    const adapted = adaptRuntimeLabTraceEvents("run-adapt", completed.trace);
    const replay = replayTrace({
      runId: "run-adapt",
      stepIds: ["s1"],
      events: adapted
    });

    expect(adapted.map((event) => event.type)).toEqual(
      expect.arrayContaining(["artifact_generated", "observation_recorded", "confirmation_granted"])
    );
    expect(replay.artifactIds).toEqual(["art-1"]);
    expect(replay.completedStepIds).toEqual(["s1"]);
    expect(replay.status).toBe("completed");
  });

  it("replays trace events into lab step and control state", () => {
    const plan = buildRunPlan({
      documentId: "trace-lab-state",
      stepGraph: {
        procedures: [],
        observations: [],
        diagnostics: [],
        steps: [
          {
            stepId: "s1",
            family: "heat",
            params: { temperature: "40 C" },
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
          }
        ]
      }
    });
    const events = [
      createTraceEvent({
        eventId: "evt-run",
        runId: "run-state",
        timestamp: "2026-05-20T10:00:00.000Z",
        type: "run_started"
      }),
      createTraceEvent({
        eventId: "evt-control",
        runId: "run-state",
        timestamp: "2026-05-20T10:01:00.000Z",
        type: "control_completed",
        controlId: "operator-approval"
      }),
      createTraceEvent({
        eventId: "evt-start",
        runId: "run-state",
        timestamp: "2026-05-20T10:02:00.000Z",
        type: "step_started",
        stepId: "s1"
      }),
      createTraceEvent({
        eventId: "evt-dev",
        runId: "run-state",
        timestamp: "2026-05-20T10:03:00.000Z",
        type: "deviation_recorded",
        stepId: "s1",
        payload: { field: "temperature", expected: "40 C", actual: "45 C" }
      }),
      createTraceEvent({
        eventId: "evt-art",
        runId: "run-state",
        timestamp: "2026-05-20T10:04:00.000Z",
        type: "artifact_generated",
        stepId: "s1",
        artifactId: "art-1"
      }),
      createTraceEvent({
        eventId: "evt-obs",
        runId: "run-state",
        timestamp: "2026-05-20T10:05:00.000Z",
        type: "observation_recorded",
        stepId: "s1",
        payload: { observationId: "obs-1", text: "Clear solution." }
      }),
      createTraceEvent({
        eventId: "evt-done",
        runId: "run-state",
        timestamp: "2026-05-20T10:06:00.000Z",
        type: "step_completed",
        stepId: "s1"
      })
    ];
    const replay = replayTrace({ runId: "run-state", stepIds: ["s1"], events });
    const state = replayTraceToLabState(plan, { runId: "run-state", stepIds: ["s1"], events });

    expect(replay.deviationCount).toBe(1);
    expect(state.status).toBe("completed");
    expect(state.currentStepId).toBeUndefined();
    expect(state.stepStates).toContainEqual(expect.objectContaining({ stepId: "s1", status: "completed" }));
    expect(state.controlStates).toContainEqual(expect.objectContaining({
      controlId: "operator-approval",
      status: "completed"
    }));
    expect(state.artifacts).toEqual([expect.objectContaining({ artifactId: "art-1" })]);
    expect(state.observations).toEqual([expect.objectContaining({
      observationId: "obs-1",
      linkedStepId: "s1",
      rawText: "Clear solution."
    })]);
    expect(state.trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ traceId: "evt-control", type: "control_completed", controlId: "operator-approval" }),
      expect.objectContaining({ traceId: "evt-obs", type: "observation_recorded", stepId: "s1" })
    ]));
  });

  it("selects the running replay step as the current step", () => {
    const plan = buildRunPlan({
      documentId: "trace-current-step",
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
          },
          {
            stepId: "s2",
            family: "observe",
            params: {},
            dependsOn: ["s1"],
            source: {
              sourceNodeType: "procedure",
              sourceNodeId: "proc-1",
              sourceType: "explicit_step",
              rawText: "step: observe"
            },
            loweringConfidence: 1
          }
        ]
      }
    });
    const events = [
      createTraceEvent({
        eventId: "evt-start",
        runId: "run-current",
        timestamp: "2026-05-20T10:02:00.000Z",
        type: "step_started",
        stepId: "s1"
      })
    ];
    const state = replayTraceToLabState(plan, {
      runId: "run-current",
      stepIds: ["s1", "s2"],
      events
    });

    expect(state.status).toBe("running");
    expect(state.currentStepId).toBe("s1");
    expect(state.stepStates).toContainEqual(expect.objectContaining({
      stepId: "s1",
      status: "running"
    }));
  });
});
