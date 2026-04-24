import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";

import { resolveChemd } from "../src/index";

describe("resolveChemd template params", () => {
  it("reports missing typed template params before expansion", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-template-missing-param
title: Missing template param
date: 2026-04-18
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::template charge_one
params: reagent: ref<molecule> | amount: quantity<amount>
:::procedure #templated
step: charge | inputs=@param.reagent | amount=@param.amount
:::
:::

:::use charge_one
reagent: @mol-a
:::
`));

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_TEMPLATE_PARAM_MISSING",
        severity: "error",
        nodeId: "charge_one"
      })
    );
  });

  it("reports template param type mismatches for object refs and quantities", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-template-param-mismatch
title: Template param mismatch
date: 2026-04-18
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: @mol-a
:::

:::template charge_one
params: reagent: ref<molecule> | amount: quantity<amount>
:::procedure #templated
step: charge | inputs=@param.reagent | amount=@param.amount
:::
:::

:::use charge_one
reagent: @rxn-main
amount: lots
:::
`));
    const mismatches = document.diagnostics.filter(
      (diagnostic) => diagnostic.code === "E_TEMPLATE_PARAM_TYPE_MISMATCH"
    );

    expect(mismatches).toHaveLength(2);
    expect(mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("reagent")
        }),
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("amount")
        })
      ])
    );
  });

  it("accepts typed template params when values match declarations", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-template-param-ok
title: Template param ok
date: 2026-04-18
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::template charge_one
params: reagent: ref<molecule> | amount: quantity<amount>
:::procedure #templated
step: charge | inputs=@param.reagent | amount=@param.amount
:::
:::

:::use charge_one
reagent: @mol-a
amount: 1.5 mmol
:::
`));

    expect(document.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_TEMPLATE_PARAM_MISSING" })
    );
    expect(document.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "E_TEMPLATE_PARAM_TYPE_MISMATCH" })
    );
  });
});
