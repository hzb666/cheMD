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
yield: 72%
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;
    const result = runChemdRepairLoop(source, {
      compileOptions: { strictChemdKind: true }
    });

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(true);
    expect(result.totalAppliedSafeFixes).toHaveLength(2);
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations[0]).toMatchObject({
      iteration: 1,
      appliedSafeFixes: expect.arrayContaining([
        expect.objectContaining({ sourceNodeId: "res-main" }),
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
    const result = runChemdRepairLoop(source, {
      compileOptions: { strictChemdKind: true }
    });

    expect(result.stoppedReason).toBe("needs_author_input");
    expect(result.changed).toBe(false);
    expect(result.totalAppliedSafeFixes).toHaveLength(0);
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
yield: 72%
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`;
    const result = runChemdRepairLoop(source, {
      compileOptions: { strictChemdKind: true },
      maxIterations: 1
    });

    expect(result.stoppedReason).toBe("max_iterations");
    expect(result.changed).toBe(false);
    expect(result.totalAppliedSafeFixes).toHaveLength(0);
    expect(result.finalResult.diagnosis.status).toBe("fixable");
  });
});
