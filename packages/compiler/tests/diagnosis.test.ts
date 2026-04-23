import { describe, expect, it } from "vitest";

import {
  applyCompilerDiagnosisSafeFixes,
  compileChemd
} from "../src/index";

describe("compiler diagnosis", () => {
  it("classifies safe quick fixes and supports compile-fix-recompile loops", () => {
    const source = `---
id: exp-diagnosis-fixable
title: Diagnosis fixable
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72%
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;
    const firstPass = compileChemd(source);

    expect(firstPass.diagnosis).toMatchObject({
      status: "fixable",
      summary: {
        safeFixCount: 2,
        requiredInputCount: 0,
        manualReviewCount: 0
      },
      nextActions: ["apply_safe_fixes", "recompile"]
    });
    expect(firstPass.diagnosis.safeFixes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        diagnosticCode: "W_AUTHORING_FIX_AVAILABLE",
        sourceNodeId: "res-main"
      }),
      expect.objectContaining({
        diagnosticCode: "W_AUTHORING_FIX_AVAILABLE",
        sourceNodeId: "ana-main"
      })
    ]));

    const fixedSource = applyCompilerDiagnosisSafeFixes(source, firstPass.diagnosis);
    const secondPass = compileChemd(fixedSource);

    expect(secondPass.diagnosis.status).toBe("clean");
    expect(secondPass.diagnosis.nextActions).toEqual(["accept"]);
  });

  it("exposes required authored facts separately from safe fixes", () => {
    const source = `---
id: exp-diagnosis-input
title: Diagnosis input
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::
`;
    const result = compileChemd(source);

    expect(result.diagnosis).toMatchObject({
      status: "needs_author_input",
      summary: {
        safeFixCount: 0,
        requiredInputCount: 1
      },
      nextActions: ["ask_for_required_inputs"]
    });
    expect(result.diagnosis.requiredInputs).toContainEqual(expect.objectContaining({
      checklistId: "basic-experiment-record",
      title: "最小实验记录",
      missingItems: expect.arrayContaining(["至少一个 result 块"])
    }));
  });

  it("routes unsupported or invalid source semantics to manual review", () => {
    const source = `:::chemd #bad
kind: invalid
smiles: CCO
:::`;
    const result = compileChemd(source, {
      strictChemdKind: true
    });

    expect(result.diagnosis).toMatchObject({
      status: "manual_review",
      summary: {
        safeFixCount: 0,
        requiredInputCount: 0,
        manualReviewCount: 1
      },
      nextActions: ["manual_rewrite"]
    });
    expect(result.diagnosis.manualReviewItems).toContainEqual(expect.objectContaining({
      diagnosticCode: "E_CHEMD_KIND_CONFLICT",
      severity: "error"
    }));
  });
});
