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
    expect(result.steps[0].provenance).toMatchObject({
      origin: "lowered",
      sourceNodeType: "procedure",
      sourceNodeId: "proc-main",
      ruleId: "step_ontology.procedure.charge"
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "W_PROCEDURE_PROSE_LOWERED",
        sourceField: "body"
      })
    ]);
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "W_PROCEDURE_PROSE_LOWERED",
      "W805"
    ]);
  });

  it("keeps decimal quantities and wrapped SI prose together while lowering English steps", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-si",
      body: [
        "To a solution of freshly made 6 (99.8 mg, 1.40 equiv) and TMEDA (0.221 mL, 4.50 equiv) in THF (2.3 mL) at",
        "−78 °C was added sBuLi (1.30 M in cyclohexane/hexane (92/8), 1.13 mL, 4.50 equiv) dropwise and the",
        "resulting solution was stirred for 15 min at −78 °C."
      ].join("\n")
    });

    expect(result.steps.map((step) => step.family)).toEqual([
      "charge",
      "cool",
      "add",
      "hold"
    ]);
    expect(result.steps[0].params.materials).toContain("99.8 mg");
    expect(result.steps[1].params.target_temperature).toBe("-78 °C");
    expect(result.steps[2].params.materials).toContain("sBuLi");
    expect(result.steps[2].params.materials).toContain("1.13 mL");
    expect(result.steps[2].params.mode).toBe("dropwise");
    expect(result.steps[3].params.duration).toBe("15 min");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "W_PROCEDURE_PROSE_LOWERED"
    ]);
  });

  it("splits English action clauses outside parentheses and preserves action order", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-clauses",
      body: "BBr3 was added dropwise, the reaction was stirred for 10 min, then quenched with H2O and extracted with EtOAc."
    });

    expect(result.steps.map((step) => step.family)).toEqual([
      "add",
      "hold",
      "quench",
      "extract"
    ]);
    expect(result.steps[0].params).toMatchObject({
      materials: "BBr3",
      mode: "dropwise"
    });
    expect(result.steps[2].params.agent).toBe("H2O");
    expect(result.steps[3].params.solvent).toBe("EtOAc");
    expect(result.steps.map((step) => step.source.rawText)).toEqual([
      "BBr3 was added dropwise",
      "the reaction was stirred for 10 min",
      "quenched with H2O",
      "extracted with EtOAc."
    ]);
  });

  it("keeps unrecognized action clauses as low-confidence prose", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-unmatched-clause",
      body: "BBr3 was added dropwise, then handled as usual, and extracted with EtOAc."
    });

    expect(result.steps.map((step) => step.family)).toEqual([
      "add",
      "observe",
      "extract"
    ]);
    expect(result.steps[1]).toMatchObject({
      params: { raw: "handled as usual" },
      loweringConfidence: 0.35
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "W_PROCEDURE_PROSE_LOWERED",
      "W805"
    ]);
  });

  it("lowers frequent SI workup and condition phrases without new families", () => {
    const result = lowerProcedureToSteps({
      procedureId: "proc-workup-conditions",
      body: [
        "The organic layer was washed with brine, dried over Na2SO4, filtered through Celite, and concentrated in vacuo.",
        "The mixture was refluxed overnight under argon in a sealed tube.",
        "The layers were separated."
      ].join(" ")
    });

    expect(result.steps.map((step) => step.family)).toEqual([
      "wash",
      "dry",
      "filter",
      "concentrate",
      "heat",
      "separate_layers"
    ]);
    expect(result.steps[0].params.solvent).toBe("brine");
    expect(result.steps[1].params.agent).toBe("Na2SO4");
    expect(result.steps[2].params.medium).toBe("Celite");
    expect(result.steps[3].params.method).toBe("reduced_pressure");
    expect(result.steps[4].params).toMatchObject({
      atmosphere: "argon",
      duration: "overnight",
      method: "reflux",
      vessel: "sealed"
    });
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
      linkedStepFamily: "add",
      provenance: expect.objectContaining({
        origin: "lowered",
        sourceNodeType: "observation",
        sourceNodeId: "obs-1",
        ruleId: "step_ontology.observation.event"
      })
    });
    expect(observation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "W_OBSERVATION_PROSE_LOWERED"
    ]);
    expect(analysis.steps.map((step) => step.family)).toEqual(["sample", "analyze"]);
    expect(analysis.steps.every((step) => step.source.sourceType === "lowered_step")).toBe(true);
    expect(analysis.steps[0].provenance).toMatchObject({
      origin: "lowered",
      sourceNodeType: "analysis",
      sourceNodeId: "ana-tlc",
      ruleId: "step_ontology.analysis.sample"
    });
  });
});
