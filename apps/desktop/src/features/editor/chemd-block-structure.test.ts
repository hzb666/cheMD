import { describe, expect, it } from "vitest";

import {
  findChemdFencePairAtLine,
  findChemdBlockPathAtLine,
  flattenChemdBlockStructure,
  parseChemdBlockStructure,
} from "./chemd-block-structure";

const source = `module exp_sticky

meta {
  id: "exp-sticky"
  title: "Sticky"
  date: "2026-06-08"
}

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
        startLine: 9,
        endLine: 11,
      },
      {
        blockType: "reaction",
        label: "reaction rxn_main",
        startLine: 13,
        endLine: 16,
      },
      {
        blockType: "procedure",
        label: "procedure proc_main",
        startLine: 18,
        endLine: 21,
        children: [
          { blockType: "step", label: "step s_charge", startLine: 19, endLine: 19 },
          { blockType: "step", label: "step s_heat", startLine: 20, endLine: 20 },
        ],
      },
    ]);
  });

  it("finds the parent and child breadcrumb path for the cursor line", () => {
    const path = findChemdBlockPathAtLine(parseChemdBlockStructure(source), 20)
      .map((node) => node.label);

    expect(path).toEqual(["procedure proc_main", "step s_heat"]);
  });

  it("flattens declarations and inline steps in source order for folding ranges", () => {
    const ranges = flattenChemdBlockStructure(parseChemdBlockStructure(source))
      .map((node) => [node.label, node.startLine, node.endLine]);

    expect(ranges).toEqual([
      ["molecule mol_start", 9, 11],
      ["reaction rxn_main", 13, 16],
      ["procedure proc_main", 18, 21],
      ["step s_charge", 19, 19],
      ["step s_heat", 20, 20],
    ]);
  });

  it("finds matching declaration braces without treating inline steps as block pairs", () => {
    const roots = parseChemdBlockStructure(source);

    expect(findChemdFencePairAtLine(roots, 18)).toEqual({
      blockType: "procedure",
      label: "procedure proc_main",
      openLine: 18,
      closeLine: 21,
    });
    expect(findChemdFencePairAtLine(roots, 21)?.openLine).toBe(18);
    expect(findChemdFencePairAtLine(roots, 19)).toBeUndefined();
  });

  it("does not synthesize a brace pair for an unclosed declaration", () => {
    const roots = parseChemdBlockStructure("molecule mol_open {\n  smiles: \"CCO\"\n");

    expect(roots[0]?.hasClosingFence).toBe(false);
    expect(findChemdFencePairAtLine(roots, 1)).toBeUndefined();
  });
});
