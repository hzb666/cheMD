import { describe, expect, it } from "vitest";

import { importProse } from "../src/index";

describe("prose importer skeleton", () => {
  it("extracts local chemical mentions into material IR", async () => {
    const result = await importProse("The substrate was dissolved in DCM and washed with brine.");

    expect(result.materials.map((material) => material.normalizedName)).toEqual([
      "dichloromethane",
      "brine"
    ]);
  });

  it("emits a confirmation diagnostic for unresolved formula-like mentions", async () => {
    const result = await importProse("The product C6H6 was detected by GC.");

    expect(result.materials[0]).toMatchObject({
      normalizedName: "C6H6",
      source: "formula-like"
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_IMPORT_FORMULA_UNRESOLVED",
        severity: "warning"
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "I_IMPORT_CHEMICAL_PROVIDER",
        severity: "info",
        facts: { provider: "local-lexicon" }
      })
    );
  });

  it("allows formula-like detection to be disabled", async () => {
    const result = await importProse("The product C6H6 was detected by GC.", {
      includeFormulaLike: false
    });

    expect(result.materials).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "I_IMPORT_CHEMICAL_PROVIDER"
      })
    );
  });

  it("extracts quantities from the Chemd quantity schema", async () => {
    const result = await importProse("The mixture was cooled to -78 °C and diluted with 25 mL DCM.");

    expect(result.quantities).toEqual([
      expect.objectContaining({
        raw: "-78 °C",
        value: -78,
        unit: "°C",
        canonicalUnit: "C",
        quantityClass: "temperature"
      }),
      expect.objectContaining({
        raw: "25 mL",
        value: 25,
        unit: "mL",
        canonicalUnit: "mL",
        quantityClass: "volume"
      })
    ]);
  });

  it("keeps compact percent literals and warns for spaced percent literals", async () => {
    const compact = await importProse("Yield was 78%.");
    const spaced = await importProse("Yield was 78 %.");

    expect(compact.quantities).toEqual([
      expect.objectContaining({
        raw: "78%",
        unit: "%",
        quantityClass: "percent"
      })
    ]);
    expect(compact.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "W_IMPORT_PERCENT_SPACING"
    );

    expect(spaced.quantities[0]).toMatchObject({
      raw: "78 %",
      unit: "%",
      quantityClass: "percent"
    });
    expect(spaced.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_IMPORT_PERCENT_SPACING",
        severity: "warning"
      })
    );
  });

  it("warns when prose uses a unit outside the Chemd quantity schema", async () => {
    const result = await importProse("The product was dried for 10 cycles.");

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_IMPORT_UNKNOWN_QUANTITY_UNIT",
        severity: "warning",
        facts: {
          raw: "10 cycles",
          unit: "cycles"
        }
      })
    );
  });

  it("builds step frames through the Chemd step ontology lowerer", async () => {
    const result = await importProse([
      "1. 将底物溶于 THF，冷却至 -78 °C。",
      "2. 在氮气下缓慢滴加 n-BuLi。"
    ].join("\n"));

    expect(result.steps.map((step) => step.family)).toEqual([
      "charge",
      "cool",
      "add"
    ]);
    expect(result.steps[1].params).toMatchObject({
      target_temperature: "-78 °C"
    });
    expect(result.steps[2].params).toMatchObject({
      mode: "dropwise",
      atmosphere: "nitrogen"
    });
  });

  it("builds observation frames with linked step evidence", async () => {
    const result = await importProse("加入 n-BuLi 后体系逐渐变深红色。");

    expect(result.observations[0]).toMatchObject({
      rawText: "加入 n-BuLi 后体系逐渐变深红色。",
      confidence: 0.78
    });
    expect(result.observations[0].evidence).toEqual([
      "step_ontology.observation.event",
      "eventType:color_change",
      "linkedStepFamily:add"
    ]);
  });
});
