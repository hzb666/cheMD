import { describe, expect, it } from "vitest";

import { insertReactionBlock } from "../src/features/reaction-editor/lib/insert-reaction-block";
import { updateReactionBlock } from "../src/features/reaction-editor/lib/update-reaction-block";

describe("reaction editor utilities", () => {
  it("inserts a standard reaction block shape", () => {
    const next = insertReactionBlock("## Title\n", "rxn-main", {
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"]
    });

    expect(next).toContain(":::chemd #rxn-main");
    expect(next).toContain("reac: CCO | O=O");
    expect(next).toContain("prod: CC(=O)O");
    expect(next).toContain("conditions: air | 80 C");
    expect(next).not.toContain("atmosphere:");
    expect(next).not.toContain("temperature:");
  });

  it("updates reactants/products/conditions in an existing reaction block", () => {
    const source = `:::chemd #rxn-main
reac: A
prod: B
conditions: old
:::`;

    const next = updateReactionBlock(source, "rxn-main", {
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"]
    });

    expect(next).toContain("reac: CCO | O=O");
    expect(next).toContain("prod: CC(=O)O");
    expect(next).toContain("conditions: air | 80 C");
    expect(next).not.toContain("atmosphere:");
    expect(next).not.toContain("temperature:");
  });

  it("keeps raw conditions readable instead of auto-expanding explicit condition fields", () => {
    const next = insertReactionBlock("", "rxn-structured", {
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"]
    });

    expect(next).toContain("conditions: Cu catalyst | EtOH | 80 C | 4 h | N2 | Na2CO3");
    expect(next).not.toContain("solvent:");
    expect(next).not.toContain("catalyst:");
    expect(next).not.toContain("temperature:");
    expect(next).not.toContain("time:");
    expect(next).not.toContain("atmosphere:");
    expect(next).not.toContain("reagents:");
  });

  it("updates a unique reaction block without an explicit id and promotes it to a stable header id", () => {
    const source = `:::chemd
reac: A
prod: B
:::`;

    const next = updateReactionBlock(source, "chem-missing-id-1", {
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"]
    });

    expect(next).toContain(":::chemd #chem-missing-id-1");
    expect(next).toContain("reac: CCO");
    expect(next).toContain("prod: CC(=O)O");
    expect(next).toContain("conditions: air | 80 C");
  });
});
