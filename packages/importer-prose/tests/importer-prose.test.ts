import { describe, expect, it } from "vitest";

import { importProse } from "../src/index";

describe("prose importer skeleton", () => {
  it("extracts local chemical mentions into material IR", async () => {
    const result = await importProse("The substrate was dissolved in DCM and washed with brine.");

    expect(result.materials.map((material) => material.normalizedName)).toEqual([
      "dichloromethane",
      "brine"
    ]);
    expect(result.steps).toEqual([]);
    expect(result.observations).toEqual([]);
  });

  it("emits a confirmation diagnostic for unresolved formula-like mentions", async () => {
    const result = await importProse("The product C6H6 was detected by GC.");

    expect(result.materials[0]).toMatchObject({
      normalizedName: "C6H6",
      source: "formula-like"
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "W_IMPORT_FORMULA_UNRESOLVED",
        severity: "warning"
      }),
      expect.objectContaining({
        code: "I_IMPORT_CHEMICAL_PROVIDER",
        severity: "info",
        facts: { provider: "local-lexicon" }
      })
    ]);
  });

  it("allows formula-like detection to be disabled", async () => {
    const result = await importProse("The product C6H6 was detected by GC.", {
      includeFormulaLike: false
    });

    expect(result.materials).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "I_IMPORT_CHEMICAL_PROVIDER"
      })
    ]);
  });
});
