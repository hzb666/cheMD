import { describe, expect, it } from "vitest";

import { updateMoleculeBlock } from "../src/features/ocr/lib/update-molecule-block";
import { insertReactionBlock } from "../src/features/reaction-editor/lib/insert-reaction-block";
import { updateReactionBlock } from "../src/features/reaction-editor/lib/update-reaction-block";

describe("reaction editor utilities", () => {
  it("inserts a standard reaction declaration shape", () => {
    const next = insertReactionBlock("## Title\n", "rxn-main", {
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"]
    });

    expect(next).toContain("reaction rxn-main {");
    expect(next).toContain('reactants: ["CCO", "O=O"]');
    expect(next).toContain('products: ["CC(=O)O"]');
    expect(next).toContain('conditions: ["air", "80 C"]');
    expect(next).not.toContain("kind:");
    expect(next).not.toContain(":::");
  });

  it("updates reactants/products/conditions in an existing reaction declaration", () => {
    const source = `reaction rxn-main {
  reactants: ["A"]
  products: ["B"]
  conditions: ["old"]
}`;

    const next = updateReactionBlock(source, "rxn-main", {
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"]
    });

    expect(next).toContain('reactants: ["CCO", "O=O"]');
    expect(next).toContain('products: ["CC(=O)O"]');
    expect(next).toContain('conditions: ["air", "80 C"]');
    expect(next).not.toContain(":::");
  });

  it("keeps raw conditions readable as one program list field", () => {
    const next = insertReactionBlock("", "rxn-structured", {
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"]
    });

    expect(next).toContain('conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"]');
    expect(next).not.toContain("solvent:");
    expect(next).not.toContain("catalyst:");
    expect(next).not.toContain("temperature:");
    expect(next).not.toContain("time:");
    expect(next).not.toContain("atmosphere:");
    expect(next).not.toContain("reagents:");
  });

  it("leaves source unchanged when the target reaction declaration is missing", () => {
    const source = `reaction rxn-other {
  reactants: ["A"]
  products: ["B"]
}`;

    expect(updateReactionBlock(source, "rxn-main", {
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"]
    })).toBe(source);
  });
});

describe("molecule editor utilities", () => {
  it("updates an unterminated molecule declaration without duplicating existing smiles", () => {
    const next = updateMoleculeBlock(
      [
        "molecule mol-main {",
        "  name: \"Ethanol\"",
        "  smiles: \"old\""
      ].join("\n"),
      "mol-main",
      "CCO"
    );

    expect(next).toBe([
      "molecule mol-main {",
      '  smiles: "CCO"',
      "  name: \"Ethanol\"",
      "}"
    ].join("\n"));
  });
});
