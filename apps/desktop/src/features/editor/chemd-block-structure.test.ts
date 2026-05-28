import { describe, expect, it } from "vitest";

import {
  findChemdFencePairAtLine,
  findChemdBlockPathAtLine,
  flattenChemdBlockStructure,
  parseChemdBlockStructure,
} from "./chemd-block-structure";

const source = `---
id: exp-sticky
---

molecule mol_start {
  smiles: "CCO"
}

reaction rxn_main {
  reactants: [@mol_start]
  products: ["CC=O"]
}

procedure proc_main for @rxn_main {
  step s_charge = charge(inputs = [@mol_start])
  step s_heat = heat(duration = "4 h")
}
`;

describe("Chemd editor block structure", () => {
  it("builds program declaration ranges from Chemd declarations", () => {
    const roots = parseChemdBlockStructure(source);

    expect(roots).toMatchObject([
      {
        blockType: "molecule",
        label: "molecule mol_start",
        startLine: 5,
        endLine: 7,
      },
      {
        blockType: "reaction",
        label: "reaction rxn_main",
        startLine: 9,
        endLine: 12,
      },
      {
        blockType: "procedure",
        label: "procedure proc_main",
        startLine: 14,
        endLine: 17,
        children: [
          { blockType: "step", label: "step s_charge", startLine: 15, endLine: 15 },
          { blockType: "step", label: "step s_heat", startLine: 16, endLine: 16 },
        ],
      },
    ]);
  });

  it("finds the parent and child breadcrumb path for the cursor line", () => {
    const path = findChemdBlockPathAtLine(parseChemdBlockStructure(source), 16)
      .map((node) => node.label);

    expect(path).toEqual(["procedure proc_main", "step s_heat"]);
  });

  it("flattens declarations and inline steps in source order for folding ranges", () => {
    const ranges = flattenChemdBlockStructure(parseChemdBlockStructure(source))
      .map((node) => [node.label, node.startLine, node.endLine]);

    expect(ranges).toEqual([
      ["molecule mol_start", 5, 7],
      ["reaction rxn_main", 9, 12],
      ["procedure proc_main", 14, 17],
      ["step s_charge", 15, 15],
      ["step s_heat", 16, 16],
    ]);
  });

  it("finds matching declaration braces without treating inline steps as block pairs", () => {
    const roots = parseChemdBlockStructure(source);

    expect(findChemdFencePairAtLine(roots, 14)).toEqual({
      blockType: "procedure",
      label: "procedure proc_main",
      openLine: 14,
      closeLine: 17,
    });
    expect(findChemdFencePairAtLine(roots, 17)?.openLine).toBe(14);
    expect(findChemdFencePairAtLine(roots, 15)).toBeUndefined();
  });

  it("does not synthesize a brace pair for an unclosed declaration", () => {
    const roots = parseChemdBlockStructure("molecule mol_open {\n  smiles: \"CCO\"\n");

    expect(roots[0]?.hasClosingFence).toBe(false);
    expect(findChemdFencePairAtLine(roots, 1)).toBeUndefined();
  });
});
