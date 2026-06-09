import { describe, expect, it } from "vitest";
import { compileChemd } from "@chemd/compiler";

import { sampleSource } from "../src/features/playground/lib/sample-source";

describe("sampleSource", () => {
  it("uses program declarations and structured procedure steps", () => {
    const result = compileChemd(sampleSource);

    expect(sampleSource).toContain("module exp_2026_03_30_001");
    expect(sampleSource).toContain("reaction chem_rxn_main");
    expect(sampleSource).toContain("molecule chem_mol_main");
    expect(sampleSource).toContain("step heat_main = heat");
    expect(result.stepGraph.procedures[0]).toMatchObject({
      sourceType: "explicit_steps"
    });
  });
});
