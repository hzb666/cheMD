import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd template params", () => {
  it("parses typed template params from inline declarations", () => {
    const document = parseChemd(`---
id: exp-template-params
title: Template params
date: 2026-04-18
---

:::template charge_pair
params: reagent_a: ref<molecule> | reagent_b: ref<molecule> | artifact: ref<artifact> | amount: quantity<amount>
:::
`);
    const template = document.children.find((node) => node.type === "template");

    expect(template).toMatchObject({
      type: "template",
      params: ["reagent_a", "reagent_b", "artifact", "amount"],
      paramSpecs: [
        { name: "reagent_a", type: { kind: "ref", targetKind: "molecule" } },
        { name: "reagent_b", type: { kind: "ref", targetKind: "molecule" } },
        { name: "artifact", type: { kind: "ref", targetKind: "artifact" } },
        { name: "amount", type: { kind: "quantity", quantityClass: "amount" } }
      ]
    });
  });

  it("parses typed template params from list declarations", () => {
    const document = parseChemd(`---
id: exp-template-list-params
title: Template list params
date: 2026-04-18
---

:::template charge_pair
params:
  - reagent_a: ref<molecule>
  - note: string
body:
:::procedure #templated
  :::step s1
  family: charge
  inputs: @param.reagent_a
  :::
:::
:::
`);
    const template = document.children.find((node) => node.type === "template");

    expect(template).toMatchObject({
      type: "template",
      params: ["reagent_a", "note"],
      paramSpecs: [
        { name: "reagent_a", type: { kind: "ref", targetKind: "molecule" } },
        { name: "note", type: { kind: "string" } }
      ],
      body: [
        {
          type: "procedure",
          steps: [
            {
              type: "step",
              stepId: "s1",
              family: "charge",
              inputs: ["@param.reagent_a"]
            }
          ]
        }
      ]
    });
  });

  it("stops list params at the next field without regex backtracking", () => {
    const document = parseChemd(`---
id: exp-template-list-boundary
title: Template list boundary
date: 2026-05-17
---

:::template charge_pair
params:
  - reagent_a: ref<molecule>
  - amount: quantity<amount>
body:
not_a_param: true
:::
`);
    const template = document.children.find((node) => node.type === "template");

    expect(template).toMatchObject({
      type: "template",
      params: ["reagent_a", "amount"],
      paramSpecs: [
        { name: "reagent_a", type: { kind: "ref", targetKind: "molecule" } },
        { name: "amount", type: { kind: "quantity", quantityClass: "amount" } }
      ]
    });
  });
});
