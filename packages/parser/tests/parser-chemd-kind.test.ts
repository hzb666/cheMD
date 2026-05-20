import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd chemd kind inference", () => {
  it("infers molecule kind from molecule-shaped fields without diagnostics", () => {
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
    expect(document.diagnostics).toEqual([]);
  });

  it("infers reaction kind from reaction-shaped fields without diagnostics", () => {
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
    expect(document.diagnostics).toEqual([]);
  });

  it("errors when chemd kind cannot be inferred", () => {
    const document = parseChemd(`---
id: exp-ambiguous-kind
title: Ambiguous kind
date: 2026-04-18
---

:::chemd #draft
name: Draft node
:::
`);

    expect(document.children).toEqual([]);
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_CHEMD_KIND_AMBIGUOUS",
        severity: "error",
        nodeId: "draft",
        quickFixes: expect.arrayContaining([
          expect.objectContaining({
            kind: "insert_chemd_kind",
            patch: expect.objectContaining({ kind: "molecule" })
          }),
          expect.objectContaining({
            kind: "insert_chemd_kind",
            patch: expect.objectContaining({ kind: "reaction" })
          })
        ])
      })
    );
  });

  it("accepts official kind value aliases", () => {
    const document = parseChemd(`---
id: exp-kind-aliases
title: Kind aliases
date: 2026-04-18
---

:::chemd #mol-alias
kind: mol
smiles: CCO
:::

:::chemd #rxn-alias
kind: reac
reactants: @mol-alias
products: product
:::
`);

    expect(document.children[0]).toMatchObject({ type: "molecule", declaredKind: "molecule" });
    expect(document.children[1]).toMatchObject({ type: "reaction", declaredKind: "reaction" });
    expect(document.diagnostics).toEqual([]);
  });

  it("rejects structured participants on plural list aliases", () => {
    const document = parseChemd(`---
id: exp-participant-syntax
title: Participant syntax
date: 2026-05-20
---

:::chemd #rxn-main
kind: reaction
reactants: @mol-a | 1.0 mmol | 1.0 eq
products: @mol-b
:::
`);

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_REACTION_PARTICIPANT_SYNTAX",
        severity: "error",
        nodeId: "rxn-main",
        sourceField: "reactants"
      })
    );
  });
});
