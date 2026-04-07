import { describe, expect, it } from "vitest";

import { selectTargetReaction } from "../src/features/ocr/lib/select-target-reaction";

describe("reaction target selection", () => {
  it("assigns a stable synthetic id to a unique reaction block without an explicit id", () => {
    const source = `:::chemd
reac: CCO
prod: CC(=O)O
:::`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "chem-missing-id-1"
    });
  });

  it("uses overall chemd ordering for anonymous reaction ids in mixed documents", () => {
    const source = `:::chemd
smiles: CCO
:::

:::chemd
reac: N2
prod: NH3
:::`;

    expect(selectTargetReaction(source)).toEqual({
      blockId: "chem-missing-id-2"
    });
  });
});
