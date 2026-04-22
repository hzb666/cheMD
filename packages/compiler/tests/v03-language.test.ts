import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

const source = `---
id: exp-v03
title: v0.3 internal language smoke
date: 2026-04-17
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #rxn-main
kind: reaction
reactants: substrate_1 | reagent_2
products: product_1
solvent: THF
temperature: -78 °C
time: 30 min
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 将底物溶于 THF，冷却至 -78 °C。
2. 在氮气下缓慢滴加 n-BuLi。
3. 反应 30 min 后取样做 TLC。
:::

:::observation #obs-main
加入 n-BuLi 后体系逐渐变深红色。
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
:::

:::sample #sample-main
derived_from: rxn-main
artifacts: spec-main
:::

:::artifact #spec-main
kind: tlc_image
ref: res-main
path: data/tlc/spec-main.png
:::
`;

describe("chemd-lang v0.3 compiler integration", () => {
  it("keeps the author surface intact and exposes semantic artifacts", () => {
    const result = compileChemd(source);

    expect(result.document.children.some((node) => node.type === "procedure")).toBe(true);
    expect(result.html).toContain("v0.3 internal language smoke");
    expect(result.typedSemanticGraph.nodes.some((node) => node.kind === "reaction")).toBe(true);
    expect(result.stepGraph.steps.map((step) => step.family)).toEqual([
      "charge",
      "cool",
      "add",
      "hold",
      "sample",
      "analyze"
    ]);
    expect(result.runtimePreflight.blocking).toBe(false);
    expect(result.lnf.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(result.lnf.experiment.workflow.steps.map((step) => step.family)).toContain("cool");
    expect(result.lnf.experiment.workflow.stepSources.loweredStepIds.length).toBeGreaterThan(0);
    expect(result.trainingExport.schema_version).toBe("chemd-training-export/v0.2");
    expect(result.trainingExport.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(result.trainingExport.semantic_layer.artifacts[0]).toMatchObject({
      original_id: "spec-main",
      artifact_kind: "tlc_image",
      path: "data/tlc/spec-main.png"
    });
    expect(result.trainingUnderstanding.entities.artifacts[0]).toMatchObject({
      artifact_kind: "tlc_image"
    });
    expect(result.trainingUnderstanding.experiment_logic.evidence_links).toContainEqual(
      expect.objectContaining({ relation_type: "artifact_supports_result" })
    );
    expect(result.trainingExport.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(JSON.parse(result.docxBridge)).toMatchObject({
      semantic: {
        typedGraph: {
          documentId: "exp-v03"
        }
      }
    });
  });
});
