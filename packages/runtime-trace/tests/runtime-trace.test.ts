import { describe, expect, it } from "vitest";

import {
  buildRunPlan,
  completeStep,
  confirmStep,
  createInitialLabState,
  startStep
} from "@chemd/runtime-lab";

import { adaptRuntimeLabTraceEvents, createTraceEvent, replayTrace } from "../src/index";

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
});
