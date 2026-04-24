import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd chemd kind fallback", () => {
  it("warns when chemd kind is inferred from molecule shape", () => {
    const document = parseChemd(`---
id: exp-inferred-molecule-kind
title: Inferred molecule kind
date: 2026-04-18
---

:::chemd #mol-inferred
smiles: CCO
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "molecule",
      id: "mol-inferred",
      syntaxOrigin: "chemd"
    });
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_CHEMD_KIND_INFERRED",
        severity: "warning",
        nodeId: "mol-inferred",
        facts: expect.objectContaining({ inferred_kind: "molecule" }),
        quickFixes: [expect.objectContaining({ kind: "insert_chemd_kind" })]
      })
    );
  });

  it("warns when chemd kind is inferred from reaction shape", () => {
    const document = parseChemd(`---
id: exp-inferred-reaction-kind
title: Inferred reaction kind
date: 2026-04-18
---

:::chemd #rxn-inferred
reactants: @a
products: @b
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "reaction",
      id: "rxn-inferred",
      syntaxOrigin: "chemd"
    });
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_CHEMD_KIND_INFERRED",
        severity: "warning",
        nodeId: "rxn-inferred",
        facts: expect.objectContaining({ inferred_kind: "reaction" })
      })
    );
  });

  it("keeps strict missing-kind diagnostics distinct from inferred fallback warnings", () => {
    const document = parseChemd(`---
id: exp-strict-missing-kind
title: Strict missing kind
date: 2026-04-18
---

:::chemd #mol-strict
smiles: CCO
:::
`, { strictChemdKind: true });

    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).toContain("W_CHEMD_KIND_AMBIGUOUS");
    expect(document.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("W_CHEMD_KIND_INFERRED");
  });
});
