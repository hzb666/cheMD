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
yield: 78%
conversion: 96±2%
purity: 91-95%
selectivity: <5%
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

  it("accepts compact percent literals while diagnosing ordinary compact units", () => {
    const result = check(`---
id: exp-quantity-diagnostics
title: Quantity diagnostics
date: 2026-05-20
---

:::result #res-main
yield: 80%
conversion: 80 %
:::

:::procedure #proc-main
step: add | id=s-add | volume=1ml | mass=1 MG
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E403",
        sourceField: "conversion",
        facts: expect.objectContaining({ raw_value: "80 %" })
      }),
      expect.objectContaining({
        code: "W_QUANTITY_UNIT_SPACING",
        severity: "warning",
        sourceNodeId: "s-add",
        sourceField: "volume",
        facts: expect.objectContaining({ raw_value: "1ml" })
      }),
      expect.objectContaining({
        code: "W_QUANTITY_UNIT_CASING",
        sourceNodeId: "s-add",
        sourceField: "mass",
        facts: expect.objectContaining({
          raw_unit: "MG",
          canonical_unit: "mg"
        })
      })
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E403",
        sourceField: "yield"
      })
    ]));
    expect(result.typedGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "result",
        yield: expect.objectContaining({
          quantityClass: "percent",
          raw: "80%",
          canonicalValue: 80,
          canonicalUnit: "percent"
        })
      })
    ]));
  });
});

describe("material, batch, and reaction participant semantics", () => {
  it("normalizes reaction_smiles alias and validates interop identity fields", () => {
    const result = check(`---
id: exp-interop
title: Interop
date: 2026-05-20
---

:::chemd #mol-a
name: ethanol
smiles: CCO
inchi: InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3
inchikey: LFQSCWFLJHTTHZ-UHFFFAOYSA-N
:::

:::chemd #mol-b
name: acetaldehyde
smiles: CC=O
:::

:::chemd #rxn-main
reaction_smiles: CCO>>CC=O
reactant: @mol-a | 1.0 mmol | 1.0 eq | limiting=true
product: @mol-b
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.typedGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "reaction",
        nodeId: "rxn-main",
        rxn_smiles: "CCO>>CC=O"
      })
    ]));
  });

  it("fails closed for invalid InChI and RXN SMILES surfaces", () => {
    const result = check(`---
id: exp-bad-interop
title: Bad interop
date: 2026-05-20
---

:::chemd #mol-a
smiles: C C O
inchi: bad-inchi
inchikey: bad-key
:::

:::chemd #rxn-main
rxn_smiles: CCO
reactant: @mol-a | 1.0 mmol | 1.0 eq | limiting=true
product: product
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_INTEROP_SMILES_PARSE", sourceField: "smiles" }),
      expect.objectContaining({ code: "E_INTEROP_INCHI_FORMAT", sourceField: "inchi" }),
      expect.objectContaining({ code: "E_INTEROP_INCHIKEY_FORMAT", sourceField: "inchikey" }),
      expect.objectContaining({ code: "E_INTEROP_RXN_SMILES_PARSE", sourceField: "rxn_smiles" })
    ]));
  });

  it("fails closed when rxn_smiles conflicts with participant identities", () => {
    const result = check(`---
id: exp-rxn-smiles-conflict
title: RXN smiles conflict
date: 2026-05-20
---

:::chemd #mol-a
smiles: CCO
:::

:::chemd #mol-b
smiles: CC=O
:::

:::chemd #rxn-main
rxn_smiles: C.C>>CC
reactant: @mol-a
product: @mol-b
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_INTEROP_RXN_SMILES_PARTICIPANT_CONFLICT",
        sourceField: "rxn_smiles"
      })
    ]));
  });

  it("fails closed when rxn_smiles participant identities cannot be verified", () => {
    const result = check(`---
id: exp-rxn-smiles-unverified
title: RXN smiles unverified
date: 2026-05-20
---

:::chemd #rxn-main
rxn_smiles: CCO>>CC=O
reactant: substrate
product: product
:::
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_INTEROP_RXN_SMILES_UNVERIFIED",
        sourceField: "rxn_smiles"
      })
    ]));
  });

  it("infers rxn_smiles from participant molecule identities when omitted", () => {
    const result = check(`---
id: exp-rxn-smiles-infer
title: RXN smiles infer
date: 2026-05-20
---

:::chemd #mol-a
smiles: CCO
:::

:::chemd #mol-b
smiles: CC=O
:::

:::chemd #rxn-main
reactant: @mol-a
product: @mol-b
:::
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.typedGraph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "reaction",
        nodeId: "rxn-main",
        rxn_smiles: "CCO>>CC=O"
      })
    ]));
  });

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
purity: 98%
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
purity: 84%
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
