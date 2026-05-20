import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

const check = (source: string) => typecheckDocument(resolveChemd(parseChemd(source)));

describe("quantity v2 semantics", () => {
  it("normalizes shorthand, comparator, range, uncertainty, and temperature programs", () => {
    const result = check(`---
id: exp-quantity-v2
title: Quantity v2
date: 2026-05-20
---

:::chemd #rxn-main
kind: reaction
reactant: substrate
product: product
temperature: r.t. -> 80 C over 30 min
time: overnight
pressure: > 1 atm
:::

:::result #res-main
yield: 78 %
conversion: 96 ± 2 %
purity: 91-95 %
selectivity: < 5 %
:::
`);

    expect(result.diagnostics).toEqual([]);
    const reaction = result.typedGraph.nodes.find((node) => node.kind === "reaction");
    const record = result.typedGraph.nodes.find((node) => node.kind === "result");

    expect(reaction).toMatchObject({
      temperature: {
        valueKind: "program",
        program: [expect.objectContaining({
          from: expect.objectContaining({ shorthand: "room_temperature" }),
          to: expect.objectContaining({ canonicalValue: 80 }),
          hold: expect.objectContaining({ canonicalValue: 0.5, canonicalUnit: "h" })
        })]
      },
      time: {
        valueKind: "shorthand",
        shorthand: "overnight"
      },
      pressure: {
        comparator: ">",
        canonicalUnit: "bar"
      }
    });
    expect(record).toMatchObject({
      conversion: expect.objectContaining({
        valueKind: "uncertainty",
        uncertainty: 2
      }),
      purity: expect.objectContaining({
        valueKind: "range",
        minValue: 91,
        maxValue: 95
      }),
      selectivity: expect.objectContaining({
        comparator: "<",
        canonicalValue: 5
      })
    });
  });

  it("diagnoses compact units and non-canonical unit casing", () => {
    const result = check(`---
id: exp-quantity-diagnostics
title: Quantity diagnostics
date: 2026-05-20
---

:::result #res-main
yield: 80%
:::

:::procedure #proc-main
step: add | id=s-add | volume=1 ml
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E403",
        sourceField: "yield",
        facts: expect.objectContaining({ raw_value: "80%" })
      }),
      expect.objectContaining({
        code: "W_QUANTITY_UNIT_CASING",
        sourceNodeId: "s-add",
        sourceField: "volume",
        facts: expect.objectContaining({
          raw_unit: "ml",
          canonical_unit: "mL"
        })
      })
    ]));
  });
});

describe("material, batch, and reaction participant semantics", () => {
  it("resolves material and batch participants with stoichiometry", () => {
    const result = check(`---
id: exp-material-stoich
title: Material stoichiometry
date: 2026-05-20
---

:::chemd #mol-aryl
kind: molecule
smiles: Brc1ccccc1
:::

:::chemd #mol-boron
kind: molecule
smiles: OB(O)c1ccccc1
:::

:::chemd #mol-product
kind: molecule
smiles: c1ccc(-c2ccccc2)cc1
:::

:::material #mat-aryl-lot-a
molecule: @mol-aryl
supplier: Sigma
lot: A123
purity: 98 %
:::

:::chemd #rxn-main
kind: reaction
reactant: @mat-aryl-lot-a | 1.0 mmol | 1.0 eq | limiting=true
reactant: @mol-boron | equiv=1.5
product: @mol-product
:::

:::batch #batch-product-crude
source: @rxn-main
molecule: @mol-product
state: crude
mass: 120 mg
purity: 84 %
:::

:::sample #sample-nmr
ref: @batch-product-crude
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.typedGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "material",
        nodeId: "mat-aryl-lot-a",
        molecule: expect.objectContaining({
          refId: "mol-aryl",
          targetKind: "molecule",
          resolved: true
        })
      }),
      expect.objectContaining({
        kind: "batch",
        nodeId: "batch-product-crude",
        source: expect.objectContaining({
          refId: "rxn-main",
          targetKind: "reaction",
          resolved: true
        })
      }),
      expect.objectContaining({
        kind: "sample",
        nodeId: "sample-nmr",
        ref: expect.objectContaining({
          refId: "batch-product-crude",
          targetKind: "batch",
          resolved: true
        })
      }),
      expect.objectContaining({
        kind: "reaction",
        nodeId: "rxn-main",
        participants: expect.arrayContaining([
          expect.objectContaining({
            role: "reactant",
            limiting: true,
            reference: expect.objectContaining({
              refId: "mat-aryl-lot-a",
              targetKind: "material",
              resolved: true
            }),
            amount: expect.objectContaining({ canonicalUnit: "mmol" }),
            equivalents: expect.objectContaining({ canonicalUnit: "equiv" })
          }),
          expect.objectContaining({
            role: "reactant",
            reference: expect.objectContaining({
              refId: "mol-boron",
              targetKind: "molecule",
              resolved: true
            }),
            equivalents: expect.objectContaining({ canonicalValue: 1.5 })
          })
        ]),
        stoichiometry: expect.objectContaining({
          consistencyStatus: "ok"
        })
      })
    ]));
  });

  it("fails closed for invalid participant and limiting boundaries", () => {
    const result = check(`---
id: exp-bad-stoich
title: Bad stoichiometry
date: 2026-05-20
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #mol-b
kind: molecule
smiles: CC=O
:::

:::chemd #rxn-main
kind: reaction
reactant: @mol-a | 1.0 mmol | limiting=true
reactant: @mol-b | 1.0 eq | limiting=true
product: @mol-b | 0.7 mmol
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_STOICHIOMETRY_LIMITING" }),
      expect.objectContaining({ code: "E_STOICHIOMETRY_QUANTITY_MISSING" }),
      expect.objectContaining({ code: "E_REACTION_PARTICIPANT_PRODUCT_QUANTITY" })
    ]));
  });
});
