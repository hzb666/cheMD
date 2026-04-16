import { describe, expect, it } from "vitest";

import { buildLnf } from "../src/index";

describe("LNF builder", () => {
  it("builds a canonical machine view without inventing author syntax", () => {
    const lnf = buildLnf({
      document: {
        id: "exp-lnf",
        title: "LNF test",
        date: "2026-04-17"
      },
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
        steps: [
          {
            stepId: "s1",
            family: "cool",
            params: { target_temperature: "0 °C" },
            source: { sourceNodeType: "procedure", sourceNodeId: "proc-1", rawText: "冷却至 0 °C。" },
            loweringConfidence: 0.95
          }
        ]
      },
      diagnostics: []
    });

    expect(lnf.schemaVersion).toBe("chemd-lnf/v0.3");
    expect(lnf.experiment.procedure[0]).toMatchObject({
      family: "cool",
      params: { target_temperature: "0 °C" }
    });
  });
});
