import { describe, expect, it } from "vitest";

import { buildRunPlan, createInitialLabState, preflightRun } from "../src/index";

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
    expect(preflight.diagnostics[0]?.code).toBe("E605");
  });
});
