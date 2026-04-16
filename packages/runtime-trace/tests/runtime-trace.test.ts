import { describe, expect, it } from "vitest";

import { createTraceEvent, replayTrace } from "../src/index";

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
});
