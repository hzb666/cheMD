import { describe, expect, it } from "vitest";

import { selectTargetReaction } from "../src/features/ocr/lib/select-target-reaction";

describe("reaction target selection", () => {
  it("assigns a stable synthetic id to a unique reaction block without an explicit id", () => {
    const source = `:::chemd
kind: reaction
reac: CCO
prod: CC(=O)O
:::`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "chem-missing-id-1"
    });
  });

  it("uses overall chemd ordering for anonymous reaction ids in mixed documents", () => {
    const source = `:::chemd
kind: molecule
smiles: CCO
:::

:::chemd
kind: reaction
reac: N2
prod: NH3
:::`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "chem-missing-id-2"
    });
  });

  it("detects an unterminated reaction block as a valid reaction target", () => {
    const source = `:::chemd #rxn-main
kind: reaction
reac: CCO
prod: CC(=O)O`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "rxn-main"
    });
  });

  it("requires explicit reaction kind for canonical edit targets", () => {
    const source = `:::chemd #rxn-kindless
reac: CCO
prod: CC(=O)O
:::`;

    expect(selectTargetReaction(source)).toBeNull();
  });
});
