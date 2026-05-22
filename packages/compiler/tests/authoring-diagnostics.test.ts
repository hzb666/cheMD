import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

describe("authoring diagnostics", () => {
  it("emits safe-fix diagnostics for conservative authoring suggestions", () => {
    const source = `---
id: exp-authoring-diagnostics
title: Authoring diagnostics
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
    const result = compileChemd(source);
    const diagnostics = result.diagnostics.filter((item) => item.code === "W_AUTHORING_FIX_AVAILABLE");

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceNodeId: "res-main",
        sourceField: "ref"
      }),
      expect.objectContaining({
        sourceNodeId: "ana-main",
        sourceField: "ref"
      })
    ]));
    expect(diagnostics[0]?.quickFixes?.[0]).toMatchObject({
      kind: "apply_authoring_patch"
    });
  });

  it("emits summary diagnostics when critical record pieces cannot be safely inferred", () => {
    const source = `---
id: exp-authoring-summary
title: Authoring summary
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::
`;
    const result = compileChemd(source);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "W_AUTHORING_INPUT_REQUIRED",
      sourceLayer: "compiler",
      facts: expect.objectContaining({
        checklist_id: "basic-experiment-record",
        missing_items: expect.arrayContaining(["至少一个 result 块"])
      })
    }));
  });

  it("diagnoses unique attempt refs for condition optimization records", () => {
    const source = `---
id: exp-authoring-attempt-diagnostics
title: Attempt diagnostics
date: 2026-04-24
primary_reaction: rxn-standard
---

:::chemd #rxn-standard
kind: reaction
reactants: substrate
products: product
solvent: THF
:::

:::chemd #rxn-var1
kind: reaction
reactants: substrate
products: product
solvent: MeCN
:::

:::condition-varies #cv-screen
standard: rxn-standard
factor: solvent | baseline=THF
attempt: var1
reaction: rxn-var1
solvent: MeCN
:::

:::analysis #ana-attempt
type: tlc
result: one major spot
:::
`;
    const result = compileChemd(source);

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "W_AUTHORING_FIX_AVAILABLE",
      sourceNodeId: "ana-attempt",
      quickFixes: expect.arrayContaining([
        expect.objectContaining({
          kind: "apply_authoring_patch",
          patch: expect.objectContaining({
            kind: "insert_field_line",
            line: "ref: @cv-screen.var1"
          })
        })
      ])
    }));
  });
});
