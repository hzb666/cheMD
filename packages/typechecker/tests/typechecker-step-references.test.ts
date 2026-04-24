import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("explicit step typed references", () => {
  it("resolves and validates explicit step input references", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-refs
title: explicit step refs
date: 2026-04-18
---

:::chemd #substrate
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @substrate
products: product
:::

:::procedure #proc-explicit
step: charge | id=s-charge | inputs=@substrate,@rxn-main,@missing
:::
`));

    const result = typecheckDocument(document);
    const chargeStep = result.stepGraph.steps.find((step) => step.stepId === "s-charge");

    expect(chargeStep?.inputs).toEqual([
      {
        raw: "@substrate",
        reference: {
          kind: "reference",
          refId: "substrate",
          targetKind: "molecule",
          resolved: true
        }
      },
      {
        raw: "@rxn-main",
        reference: expect.objectContaining({
          refId: "rxn-main",
          targetKind: "reaction",
          resolved: true
        })
      },
      {
        raw: "@missing",
        reference: expect.objectContaining({
          refId: "missing",
          targetKind: "unknown",
          resolved: false
        })
      }
    ]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "s-charge",
          facts: expect.objectContaining({
            field: "inputs",
            ref_id: "rxn-main",
            expected_target_kind: "molecule",
            actual_target_kind: "reaction"
          })
        }),
        expect.objectContaining({
          code: "E_TYPED_REFERENCE_MISMATCH",
          sourceNodeId: "s-charge",
          facts: expect.objectContaining({
            field: "inputs",
            ref_id: "missing",
            actual_target_kind: "unknown"
          })
        })
      ])
    );
  });
});
