import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";

import { typecheckDocument } from "../src/index";

describe("typecheckDocument derived expressions", () => {
  it("evaluates pure numeric expressions for quantity fields", () => {
    const result = typecheckDocument(parseChemd(`---
id: exp-derived-percent
title: Derived percent
date: 2026-04-18
---

:::result #res-main
status: success
yield: =percent(20 + 1, 50)
:::
`));
    const node = result.typedGraph.nodes.find((item) => item.kind === "result");

    expect(result.diagnostics).toEqual([]);
    expect(node).toMatchObject({
      kind: "result",
      yield: {
        raw: "42%",
        value: 42,
        canonicalUnit: "percent",
        provenance: {
          origin: "inferred",
          sourceNodeType: "result",
          sourceNodeId: "res-main",
          sourceField: "yield",
          ruleId: "typechecker.derived_expression"
        }
      }
    });
  });

  it("evaluates whitelisted field references and unit conversion", () => {
    const result = typecheckDocument(parseChemd(`---
id: exp-derived-ref
title: Derived ref
date: 2026-04-18
---

:::result #res-source
status: partial
selectivity: 80%
isolated_mass: 1 g
:::

:::result #res-derived
status: success
purity: =coalesce(@res-source.selectivity, 95%)
isolated_mass: =to_unit(@res-source.isolated_mass, mg)
:::
`));
    const node = result.typedGraph.nodes.find((item) => item.kind === "result" && item.nodeId === "res-derived");

    expect(result.diagnostics).toEqual([]);
    expect(node).toMatchObject({
      purity: {
        raw: "80%",
        value: 80
      },
      isolatedMass: {
        raw: "1000 mg",
        value: 1000,
        unit: "mg"
      }
    });
  });

  it("rejects arbitrary functions and script-like expressions", () => {
    const result = typecheckDocument(parseChemd(`---
id: exp-derived-invalid
title: Derived invalid
date: 2026-04-18
---

:::result #res-main
status: success
yield: =foo(1)
purity: =function foo(x) {}
:::
`));

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_DERIVED_EXPRESSION_INVALID",
          severity: "error",
          sourceLayer: "typechecker",
          sourceNodeType: "result",
          sourceNodeId: "res-main"
        })
      ])
    );
  });
});
