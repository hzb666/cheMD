import { describe, expect, it } from "vitest";

import {
  importProse,
  importProseToChemd,
  renderChemdDraft
} from "../src/index";

const siProcedureSource = `To a solution of freshly made 6 (99.8 mg, 1.40 equiv) and TMEDA (0.221 mL, 4.50 equiv)A in THF (2.3 mL) at
−78 °C was added sBuLi (1.30 M in cyclohexane/hexane (92/8), 1.13 mL, 4.50 equiv)B dropwise and the
resulting solution was stirred for 15 min at −78 °C. Acyl silane 7 (0.322 mmol, 1.00 equiv) was added dropwise
and the reaction was stirred for 10 min before the addition of tBuOH (53.4 µL, 1.70 equiv) in THF (0.3 mL). The
reaction was stirred for 10 min at −78 °C then warmed to 0 °C. E2 (2.80 equiv) was added, and the resulting
solution was stirred for 5 min. H2O (10 mL) was then added to quench the reaction, and the mixture was
extracted with EtOAc (3× 10 mL). The combined organic phases were dried (MgSO4), filtered, and concentrated
under reduced pressure. The crude silyl enol ether was dissolved in THF (6 mL) and cooled to 0 °C. To this
was added 0.1 M aq. HCl (6.4 mL, 2.0 equiv) and the reaction was stirred at 0 °C for 1 h. Sat. aq. NaHCO3 (10
mL) was added to quench the reaction and the resulting solution was diluted with H2O and extracted with EtOAc
(3× 10 mL). The combined organic phases were dried (MgSO4), filtered, concentrated under reduced pressure
and the residue was purified by flash column chromatography on silica gel to yield the corresponding azetidine
(5).`;

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

  it("keeps unmatched prose as unparsed import evidence instead of rendered steps", async () => {
    const result = await importProse("The mixture was handled as usual.");
    const chemd = renderChemdDraft(result, {
      documentId: "exp-unparsed",
      title: "Unparsed"
    });

    expect(result.steps).toEqual([]);
    expect(result.unparsedSpans[0]).toMatchObject({
      reason: "no_canonical_step",
      text: "The mixture was handled as usual."
    });
    expect(chemd).not.toContain("step: observe");
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

  it("renders import IR to existing Chemd block syntax", async () => {
    const candidate = await importProse("加入 n-BuLi 后体系逐渐变深红色。");
    const chemd = renderChemdDraft(candidate, {
      documentId: "exp-import-test",
      title: "Import test",
      date: "2026-05-23"
    });

    expect(candidate.reactionCandidates).toEqual([]);
    expect(chemd).toContain(":::procedure #import-procedure");
    expect(chemd).not.toContain(":::chemd");
    expect(chemd).toContain("step: add | id=s1 | materials=n-BuLi");
    expect(chemd).toContain(":::observation #import-observation");
    expect(chemd).toContain("event: color_change | id=e1 | linkedStep=s1 | confidence=0.78");
  });

  it("validates rendered Chemd through the compiler", async () => {
    const result = await importProseToChemd("加入 n-BuLi 后体系逐渐变深红色。", {
      documentId: "exp-import-compile",
      title: "Import compile",
      date: "2026-05-23"
    });

    expect(result.valid).toBe(true);
    expect(result.compileResult.stepGraph.steps.map((step) => step.family)).toContain("add");
    expect(result.compileResult.diagnostics.map((diagnostic) => diagnostic.severity)).not.toContain("error");
  });

  it("imports a wrapped English SI procedure into a compiler-valid Chemd draft", async () => {
    const result = await importProseToChemd(siProcedureSource, {
      documentId: "exp-si-import",
      title: "SI import",
      date: "2026-05-23"
    });
    const families = result.candidate.steps.map((step) => step.family);
    const errorCodes = result.compileResult.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code);
    const extractSteps = result.candidate.steps.filter((step) => step.family === "extract");
    const addSteps = result.candidate.steps.filter((step) => step.family === "add");

    expect(result.valid).toBe(true);
    expect(result.candidate.reactionCandidates).toEqual([]);
    expect(result.chemd).not.toContain(":::chemd");
    expect(errorCodes).toEqual([]);
    expect(families).toEqual(expect.arrayContaining([
      "charge",
      "cool",
      "add",
      "hold",
      "quench",
      "extract",
      "dry",
      "concentrate",
      "purify"
    ]));
    expect(result.candidate.observations).toEqual([]);
    expect(result.candidate.quantities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: -78,
        canonicalUnit: "C",
        quantityClass: "temperature"
      })
    ]));
    expect(addSteps.every((step) => typeof step.params.materials === "string")).toBe(true);
    expect(extractSteps.every((step) => step.params.solvent === "EtOAc")).toBe(true);
    expect(extractSteps.every((step) => step.params.repeats === 3)).toBe(true);
    expect(result.chemd).toContain("target_temperature=-78 °C");
    expect(result.chemd).toContain("solvent=EtOAc");
    expect(result.chemd).toContain("technique=flash column chromatography");
  });
});
