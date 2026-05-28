import { describe, expect, it } from "vitest";

import { selectTargetReaction } from "../src/features/ocr/lib/select-target-reaction";

describe("reaction target selection", () => {
  it("selects a unique reaction declaration", () => {
    const source = `reaction rxn-main {
  reactants: ["CCO"]
  products: ["CC(=O)O"]
}`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "rxn-main"
    });
  });

  it("uses only reaction declarations in mixed documents", () => {
    const source = `molecule mol-main {
  smiles: "CCO"
}

reaction rxn-main {
  reactants: [@mol-main]
  products: ["CC(=O)O"]
}`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "rxn-main"
    });
  });

  it("detects an unterminated reaction declaration as a valid reaction target", () => {
    const source = `reaction rxn-main {
  reactants: ["CCO"]
  products: ["CC(=O)O"]`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "rxn-main"
    });
  });

  it("requires a reaction declaration for canonical edit targets", () => {
    const source = `molecule mol-main {
  smiles: "CCO"
}`;

    expect(selectTargetReaction(source)).toBeNull();
  });
});
