import { describe, expect, it } from "vitest";

import {
  buildProcedureState,
  lowerProcedureToSteps
} from "../src/index";
import type { CanonicalStepNode } from "../src/index";

describe("procedure state model", () => {
  it("builds ordered snapshots from canonical procedure steps", () => {
    const lowered = lowerProcedureToSteps({
      procedureId: "proc-state",
      body: [
        "To a solution of substrate in THF at -78 °C was added sBuLi dropwise.",
        "The reaction was stirred for 15 min.",
        "The mixture was quenched with H2O and extracted with EtOAc.",
        "The organic layer was washed with brine, dried over MgSO4, filtered through Celite, and concentrated in vacuo."
      ].join(" ")
    });

    const state = buildProcedureState(lowered.steps);

    expect(state.snapshots.length).toBe(lowered.steps.length);
    expect(state.finalState.contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "substrate", role: "material" }),
      expect.objectContaining({ name: "THF", role: "solvent" }),
      expect.objectContaining({ name: "sBuLi", role: "material" }),
      expect.objectContaining({ name: "H2O", role: "quench_agent" }),
      expect.objectContaining({ name: "brine", role: "wash_solvent" }),
      expect.objectContaining({ name: "MgSO4", role: "drying_agent" })
    ]));
    expect(state.finalState.conditions).toMatchObject({
      duration: "15 min",
      temperature: "-78 °C"
    });
    expect(state.finalState.phaseMarkers).toEqual(expect.arrayContaining([
      "extracted",
      "filtered",
      "concentrated"
    ]));
    expect(state.finalState.stateTags).toEqual(expect.arrayContaining([
      "mixture_present",
      "quenched"
    ]));
    expect(state.violations).toEqual([]);
    expect(state.warnings).toEqual([]);
  });

  it("warns when a canonical step has no state transition", () => {
    const step: CanonicalStepNode = {
      family: "observe",
      loweringConfidence: 0.4,
      params: { raw: "noted" },
      source: {
        rawText: "noted",
        sourceNodeType: "procedure"
      },
      stepId: "s-observe"
    };

    const state = buildProcedureState([step]);

    expect(state.warnings).toEqual([
      expect.objectContaining({
        code: "W_STATE_UNSUPPORTED_STEP",
        stepFamily: "observe",
        stepId: "s-observe"
      })
    ]);
    expect(state.snapshots[0].warnings).toHaveLength(1);
  });

  it("records invalid procedure state transitions", () => {
    const steps: CanonicalStepNode[] = [
      {
        family: "heat",
        loweringConfidence: 1,
        params: { temperature: "80 C" },
        source: { rawText: "heat", sourceNodeType: "procedure" },
        stepId: "heat-first"
      },
      {
        family: "charge",
        loweringConfidence: 1,
        params: { materials: "substrate" },
        source: { rawText: "charge", sourceNodeType: "procedure" },
        stepId: "charge"
      },
      {
        family: "quench",
        loweringConfidence: 1,
        params: { materials: "H2O" },
        source: { rawText: "quench", sourceNodeType: "procedure" },
        stepId: "quench"
      },
      {
        family: "heat",
        loweringConfidence: 1,
        params: { duration: "5 min" },
        source: { rawText: "heat", sourceNodeType: "procedure" },
        stepId: "heat-after-quench"
      },
      {
        family: "separate_layers",
        loweringConfidence: 1,
        params: {},
        source: { rawText: "separate", sourceNodeType: "procedure" },
        stepId: "split"
      }
    ];

    const state = buildProcedureState(steps);

    expect(state.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_STATE_MIXTURE_REQUIRED", stepId: "heat-first" }),
      expect.objectContaining({ code: "E_STATE_ACTIVE_REACTION_REQUIRED", stepId: "heat-after-quench" }),
      expect.objectContaining({ code: "E_STATE_BIPHASIC_REQUIRED", stepId: "split" })
    ]));
    expect(state.snapshots[3].violations).toEqual([
      expect.objectContaining({ code: "E_STATE_ACTIVE_REACTION_REQUIRED" })
    ]);
  });
});
