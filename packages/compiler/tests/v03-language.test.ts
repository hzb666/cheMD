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
    expect(result.lnf.experiment.procedure.map((step) => step.family)).toContain("cool");
    expect(result.trainingExport.semantic_layer.v03_lnf?.experiment.procedure.length).toBeGreaterThan(0);
  });
});
