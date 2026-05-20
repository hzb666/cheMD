import { describe, expect, it } from "vitest";

import { runChemdRepairLoop } from "../src/index";

describe("runChemdRepairLoop", () => {
  it("applies deterministic safe fixes until the document is clean", () => {
    const source = `---
id: exp-repair-loop
title: Repair loop
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72 %
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;
    const result = runChemdRepairLoop(source);

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(true);
    expect(result.totalAppliedSafeFixes).toHaveLength(5);
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations[0]).toMatchObject({
      iteration: 1,
      appliedSafeFixes: expect.arrayContaining([
        expect.objectContaining({ sourceField: "primary_reaction" }),
        expect.objectContaining({ sourceField: "primary_result" }),
        expect.objectContaining({ sourceNodeId: "res-main" }),
        expect.objectContaining({ sourceNodeId: "res-main", sourceField: "product" }),
        expect.objectContaining({ sourceNodeId: "ana-main" })
      ])
    });
    expect(result.finalResult.diagnosis.status).toBe("clean");
    expect(result.finalSource).toContain("ref: rxn-main");
  });

  it("stops with required-input status when deterministic fixes are exhausted", () => {
    const source = `---
id: exp-repair-loop-required
title: Repair loop required
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::
`;
    const result = runChemdRepairLoop(source);

    expect(result.stoppedReason).toBe("needs_author_input");
    expect(result.changed).toBe(true);
    expect(result.totalAppliedSafeFixes).toHaveLength(1);
    expect(result.finalSource).toContain("primary_reaction: rxn-main");
    expect(result.finalResult.diagnosis.requiredInputs).toContainEqual(expect.objectContaining({
      checklistId: "basic-experiment-record"
    }));
  });

  it("honors the max iteration budget before applying another round of fixes", () => {
    const source = `---
id: exp-repair-loop-budget
title: Repair loop budget
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72 %
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;
    const result = runChemdRepairLoop(source, {
      maxIterations: 1
    });

    expect(result.stoppedReason).toBe("max_iterations");
    expect(result.changed).toBe(false);
    expect(result.totalAppliedSafeFixes).toHaveLength(0);
    expect(result.finalResult.diagnosis.status).toBe("fixable");
  });

  it("keeps stable inferred chemd kind while finishing the repair loop", () => {
    const source = `---
id: exp-repair-loop-kind
title: Repair loop kind
date: 2026-04-24
---

:::chemd #rxn-main
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72 %
:::`;
    const result = runChemdRepairLoop(source);

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(true);
    expect(result.finalSource).not.toContain("kind: reaction");
    expect(result.finalSource).toContain("ref: rxn-main");
    expect(result.totalAppliedSafeFixes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ diagnosticCode: "W_CHEMD_KIND_AMBIGUOUS" })
    ]));
    expect(result.totalAppliedSafeFixes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        diagnosticCode: "W_AUTHORING_FIX_AVAILABLE",
        sourceNodeId: "res-main"
      })
    ]));
  });

  it("canonicalizes condition screen standard, baseline, varies, and result pairing", () => {
    const source = `---
id: exp-repair-loop-condition
title: Repair loop condition
date: 2026-04-24
---

:::chemd #rxn-standard
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
catalyst: Pd
:::

:::chemd #rxn-var1
kind: reaction
reactants: substrate
products: product
solvent: MeCN
temperature: 40 C
catalyst: Pd
:::

:::result #res-var1
ref: rxn-var1
status: success
yield: 81 %
:::

:::condition-varies #cv-screen
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
:::
`;
    const result = runChemdRepairLoop(source, {
      maxIterations: 5
    });

    expect(result.stoppedReason).toBe("clean");
    expect(result.finalSource).toContain("standard: rxn-standard");
    expect(result.finalSource).toContain("condition: solvent=THF | temperature=25 C | catalyst=Pd");
    expect(result.finalSource).toContain("varies: solvent | temperature");
    expect(result.finalSource).toContain("res1: res-var1");
    expect(result.totalAppliedSafeFixes).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeId: "cv-screen", sourceField: "standard" }),
      expect.objectContaining({ sourceNodeId: "cv-screen", sourceField: "condition" }),
      expect.objectContaining({ sourceNodeId: "cv-screen", sourceField: "varies" }),
      expect.objectContaining({ sourceNodeId: "cv-screen", sourceField: "res1" })
    ]));
  });
});
