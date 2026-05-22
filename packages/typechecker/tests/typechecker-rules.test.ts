import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("typechecker object quantities and references", () => {
  it("normalizes molecule and reaction quantities with source fields", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-object-quantities
title: Object quantities
date: 2026-04-18
---

:::chemd #substrate
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactant: @substrate | 1.2 mmol | 1.5 equiv | limiting=true
product: product
temperature: 25 C
time: 30 min
pressure: 1 atm
:::
`));

    const result = typecheckDocument(document);
    const quantities = result.typedGraph.quantities.map((quantity) => ({
      sourceNodeId: quantity.sourceNodeId,
      sourceField: quantity.sourceField,
      canonicalUnit: quantity.canonicalUnit
    }));

    expect(quantities).toEqual(
      expect.arrayContaining([
        { sourceNodeId: "rxn-main", sourceField: "reactant.amount", canonicalUnit: "mmol" },
        { sourceNodeId: "rxn-main", sourceField: "reactant.equivalents", canonicalUnit: "equiv" },
        { sourceNodeId: "rxn-main", sourceField: "temperature", canonicalUnit: "C" },
        { sourceNodeId: "rxn-main", sourceField: "time", canonicalUnit: "h" },
        { sourceNodeId: "rxn-main", sourceField: "pressure", canonicalUnit: "bar" }
      ])
    );
  });

  it("normalizes bounded domain strings while allowing extensions", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-domain-values
title: Domain values
date: 2026-04-18
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
atmosphere: N2
:::

:::analysis #ana-known
type: TLC
:::

:::analysis #ana-extension
type: uv-vis
:::
`));

    const result = typecheckDocument(document);
    const reaction = result.typedGraph.nodes.find((node) => node.kind === "reaction");
    const knownAnalysis = result.typedGraph.nodes.find((node) => node.nodeId === "ana-known");
    const extensionAnalysis = result.typedGraph.nodes.find((node) => node.nodeId === "ana-extension");

    expect(reaction).toMatchObject({
      atmosphere: {
        kind: "known",
        raw: "N2",
        value: "nitrogen"
      }
    });
    expect(knownAnalysis).toMatchObject({
      analysisType: {
        kind: "known",
        raw: "TLC",
        value: "tlc"
      }
    });
    expect(extensionAnalysis).toMatchObject({
      analysisType: {
        kind: "known",
        raw: "uv-vis",
        value: "uv"
      }
    });
  });

  it("reports missing typed object references on reactions and analyses", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-object-refs
title: Object refs
date: 2026-04-18
---

:::chemd #substrate
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactant: @substrate
reactant: @missing-reactant
product: @missing-product
:::

:::analysis #ana-main
type: tlc
ref: @missing-analysis-ref
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "rxn-main",
          facts: expect.objectContaining({
            field: "reactant",
            ref_id: "missing-reactant",
            expected_target_kind: "molecule|material|batch"
          })
        }),
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "rxn-main",
          facts: expect.objectContaining({
            field: "product",
            ref_id: "missing-product",
            expected_target_kind: "molecule|material|batch"
          })
        }),
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "ana-main",
          facts: expect.objectContaining({
            field: "ref",
            ref_id: "missing-analysis-ref"
          })
        })
      ])
    );
  });

});

describe("typechecker cross-object relationships", () => {
  it("checks result and sample cross-object relationships", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-cross-refs
title: Cross refs
date: 2026-04-18
---

:::chemd #product-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: reagent
products: @product-a
yield: 50%
:::

:::result #res-main
reaction: @rxn-main
product: @missing-product
yield: 65%
:::

:::sample #sample-main
name: Product sample
ref: @missing-sample-ref
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "res-main",
          sourceField: "product"
        }),
        expect.objectContaining({
          code: "E_RESULT_REACTION_CONFLICT",
          sourceNodeId: "res-main",
          sourceField: "yield"
        }),
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "sample-main",
          sourceField: "ref"
        })
      ])
    );
  });
});

describe("typechecker step parameter rules", () => {
  it("reports missing recommended parameters for extract and invalid filter params", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-rules
title: Step rules
date: 2026-04-18
---

:::procedure #proc-main
step: extract | id=s-extract
step: filter | id=s-filter | speed=fast
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_STEP_PARAM_MISSING",
          sourceNodeId: "s-extract",
          facts: expect.objectContaining({
            step_family: "extract",
            expected: "solvent"
          })
        }),
        expect.objectContaining({
          code: "E_STEP_PARAM_INVALID",
          sourceNodeId: "s-filter",
          facts: expect.objectContaining({
            step_family: "filter",
            allowed_params: ["medium", "wash"]
          })
        })
      ])
    );
  });

  it("types explicit steps and step object-reference params in the semantic graph", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-typed-graph
title: Typed graph steps
date: 2026-04-18
---

:::chemd #substrate
kind: molecule
smiles: CCO
:::

:::chemd #product
kind: molecule
smiles: CC=O
:::

:::procedure #proc-main
step: add | id=s-add | inputs=@substrate | outputs=@product | material=@substrate
:::

:::observation #obs-main
event: color_change | id=e-color | color=yellow | linkedStep=s-add
:::
`));

    const result = typecheckDocument(document);

    expect(result.typedGraph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "step",
          nodeId: "s-add",
          outputs: [expect.objectContaining({
            raw: "@product",
            reference: expect.objectContaining({
              refId: "product",
              targetKind: "molecule",
              resolved: true
            })
          })],
          params: expect.objectContaining({
            materials: expect.objectContaining({
              kind: "reference",
              refId: "substrate",
              targetKind: "molecule",
              resolved: true
            })
          })
        }),
        expect.objectContaining({
          kind: "observation_event",
          nodeId: "e-color",
          eventType: "color_change",
          linkedStepId: "s-add"
        })
      ])
    );
  });
});
