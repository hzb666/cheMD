import { describe, expect, it } from "vitest";

import { selectTargetMolecule } from "../src/features/ocr/lib/select-target-molecule";
import { selectTargetReaction } from "../src/features/ocr/lib/select-target-reaction";

describe("OCR target selection", () => {
  it("uses explicit reaction kind before field-shape inference", () => {
    const source = [
      ":::chemd #rxn-placeholder",
      "kind: reaction",
      ":::"
    ].join("\n");

    expect(selectTargetReaction(source)?.blockId).toBe("rxn-placeholder");
    expect(selectTargetMolecule(source)).toBeNull();
  });

  it("uses explicit molecule kind before reaction-shaped fields", () => {
    const source = [
      ":::chemd #mol-conflict",
      "kind: molecule",
      "reactants: @a",
      "products: @b",
      ":::"
    ].join("\n");

    expect(selectTargetMolecule(source)?.blockId).toBe("mol-conflict");
    expect(selectTargetReaction(source)).toBeNull();
  });

  it("does not select kind-less chemd blocks as canonical edit targets", () => {
    const source = [
      ":::chemd #rxn-main",
      "reactants: @a",
      "products: @b",
      ":::"
    ].join("\n");

    expect(selectTargetReaction(source)).toBeNull();
    expect(selectTargetMolecule(source)).toBeNull();
  });
});
