import { describe, expect, it } from "vitest";

import {
  lowerAnalysisToSteps,
  lowerObservationToEvents,
  lowerProcedureToSteps
} from "../src/index";

describe("procedure and observation lowering", () => {
  it("lowers ordered Chinese procedure text to canonical steps", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-main",
      body: [
        "1. 将底物溶于 THF，冷却至 -78 °C。",
        "2. 在氮气下缓慢滴加 n-BuLi。",
        "3. 反应 30 min 后取样做 TLC。"
      ].join("\n")
    });

    expect(result.steps.map((step) => step.family)).toEqual([
      "charge",
      "cool",
      "add",
      "hold",
      "sample",
      "analyze"
    ]);
    expect(result.steps[1].params.target_temperature).toBe("-78 °C");
    expect(result.steps[2].params.mode).toBe("dropwise");
    expect(result.diagnostics).toEqual([]);
  });

  it("preserves ambiguous prose and emits a low-confidence diagnostic", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-weak",
      body: "处理后照常做。"
    });

    expect(result.steps[0]).toMatchObject({
      family: "observe",
      loweringConfidence: 0.35
    });
    expect(result.diagnostics[0]?.code).toBe("W805");
  });

  it("lowers observations and analysis blocks without new surface syntax", () => {
    const observation = lowerObservationToEvents({
      observationId: "obs-1",
      body: "加入 n-BuLi 后体系逐渐变深红色。"
    });
    const analysis = lowerAnalysisToSteps({
      analysisId: "ana-tlc",
      analysisType: "tlc"
    });

    expect(observation.events[0]).toMatchObject({
      eventType: "color_change",
      linkedStepFamily: "add"
    });
    expect(analysis.steps.map((step) => step.family)).toEqual(["sample", "analyze"]);
  });
});
