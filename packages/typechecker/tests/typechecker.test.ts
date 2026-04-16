import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("typed semantic graph", () => {
  it("builds typed nodes and a step graph from a resolved document", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-typed
title: typed test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a | b
products: c
temperature: 100 °C
time: 16 h
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 氮气置换 15 min。
2. 加热到 100 °C 反应 16 h。
:::

:::result #res-main
status: partial
yield: 23%
:::
`));

    const result = typecheckDocument(document);

    expect(result.typedGraph.nodes.some((node) => node.kind === "reaction")).toBe(true);
    expect(result.stepGraph.steps.map((step) => step.family)).toContain("purge");
    expect(result.typedGraph.quantities.some((quantity) => quantity.canonicalUnit === "C")).toBe(true);
  });

  it("emits quantity and status diagnostics while preserving raw values", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-bad
title: bad typed test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a
products: b
temperature: overnight
:::

:::result #res-main
status: excellent
yield: THF
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["E403", "E306"])
    );
    expect(result.typedGraph.quantities.some((quantity) => quantity.raw === "overnight")).toBe(true);
  });
});
