import { describe, expect, it } from "vitest";

import { buildCanonicalLnf } from "@chemd/lnf";
import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import { exportTrainingRecordFromDocument } from "../src/index";

describe("training export", () => {
  it("includes canonical LNF and procedure lowering pairs when provided", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export
title: Export test
date: 2026-04-17
---

:::procedure #proc-main
1. 冷却至 0 °C。
:::

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
solvent: THF
:::
`));
    const checked = typecheckDocument(document);
    const lnf = buildCanonicalLnf({
      document,
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      diagnostics: checked.diagnostics
    });
    const record = exportTrainingRecordFromDocument(document, {
      stepGraph: checked.stepGraph,
      typedGraph: checked.typedGraph,
      lnf,
      exportedAt: "2026-04-17T00:00:00.000Z"
    });

    expect(record.schema_version).toBe("chemd-training-export/v0.2");
    expect(record.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(record.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(record.learning_layer.procedure_to_steps?.[0]?.steps[0]?.family).toBe("cool");
    expect(record.learning_layer.procedure_to_steps?.[0]).toMatchObject({
      source_type: "lowered_prose",
      low_confidence_step_count: 0
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      syntax_origin: "chemd",
      declared_kind: "reaction",
      normalized_conditions: {
        solvent: {
          normalized: "tetrahydrofuran"
        }
      }
    });
    expect(record.source_layer.raw_children.find((node) => node.node_type === "procedure")).toMatchObject({
      source_block_type: "procedure"
    });
  });

  it("preserves all explicit step source text in procedure learning pairs", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-steps
title: Export explicit steps
date: 2026-04-17
---

:::procedure #proc-main
step: add | materials=A
step: heat | target_temperature=80 C
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      stepGraph: checked.stepGraph,
      typedGraph: checked.typedGraph,
      exportedAt: "2026-04-17T00:00:00.000Z"
    });

    expect(record.learning_layer.procedure_to_steps?.[0]?.source_text).toBe(
      ["step: add | materials=A", "step: heat | target_temperature=80 C"].join("\n")
    );
  });

  it("builds typed graph fallback for normalized semantic fields", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-fallback
title: Export fallback
date: 2026-04-18
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
solvent: THF
:::
`));
    const record = exportTrainingRecordFromDocument(document, {
      exportedAt: "2026-04-18T00:00:00.000Z"
    });

    expect(record.semantic_layer.reactions[0]?.normalized_conditions).toMatchObject({
      solvent: {
        normalized: "tetrahydrofuran"
      }
    });
  });

  it("exports CAS separately from SMILES for molecule semantics", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-cas
title: Export CAS
date: 2026-04-19
---

:::chemd #mol-cas
kind: molecule
cas: 64-17-5
name: ethanol
:::
`));
    const record = exportTrainingRecordFromDocument(document, {
      exportedAt: "2026-04-19T00:00:00.000Z"
    });

    expect(record.semantic_layer.molecules[0]).toMatchObject({
      original_id: "mol-cas",
      cas: "64-17-5",
      name: "ethanol"
    });
    expect(record.semantic_layer.molecules[0]).not.toMatchObject({ smiles: "64-17-5" });
  });

  it("uses typed graph and canonical LNF data for training features", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-typed
title: Export typed graph
date: 2026-04-19
primary_result: res-main
---

:::chemd #mol-a
kind: molecule
smiles: CCO
amount: 1.2 mmol
equivalents: 1.0 equiv
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: product
solvent: THF
temperature: 25 C
yield: 81%
:::

:::result #res-main
status: success
yield: 80%
purity: 95%
:::

:::sample #sample-main
name: final product
purity: 95%
:::
`));
    const checked = typecheckDocument(document);
    const lnf = buildCanonicalLnf({
      document,
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      diagnostics: checked.diagnostics
    });
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      lnf,
      exportedAt: "2026-04-19T00:00:00.000Z"
    });

    expect(record.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(record.semantic_layer.molecules[0]).toMatchObject({
      amount_value: { value: 1.2, unit: "mmol" },
      equivalents_value: 1
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      normalized_outcome_hints: {
        yield_percent: 81
      }
    });
    expect(record.semantic_layer.results[0]).toMatchObject({
      status_label: "success",
      yield_percent: 80,
      purity_percent: 95
    });
    expect(record.semantic_layer.samples[0]).toMatchObject({
      purity_percent: 95
    });
    expect(record.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(record.learning_layer.prediction_instances[0]).toMatchObject({
      targets: {
        status_class: "success",
        yield_percent: 80
      },
      usability: {
        usable_for_classification: true,
        usable_for_yield_regression: true
      }
    });
    expect(record.quality_layer.training_quality.prediction_eligible).toBe(true);
  });
});
