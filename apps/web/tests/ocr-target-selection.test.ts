import { describe, expect, it } from "vitest";

import { selectTargetMolecule } from "../src/features/ocr/lib/select-target-molecule";
import { selectTargetReaction } from "../src/features/ocr/lib/select-target-reaction";

describe("OCR target selection", () => {
  it("selects reaction declarations by declaration kind", () => {
    const source = [
      "reaction rxn-placeholder {",
      "}",
    ].join("\n");

    expect(selectTargetReaction(source)?.blockId).toBe("rxn-placeholder");
    expect(selectTargetMolecule(source)).toBeNull();
  });

  it("selects molecule declarations even with reaction-shaped fields", () => {
    const source = [
      "molecule mol-conflict {",
      "  reactants: [@a]",
      "  products: [@b]",
      "}",
    ].join("\n");

    expect(selectTargetMolecule(source)?.blockId).toBe("mol-conflict");
    expect(selectTargetReaction(source)).toBeNull();
  });

  it("does not select plain fields as canonical edit targets", () => {
    const source = [
      "reactants: [@a]",
      "products: [@b]",
    ].join("\n");

    expect(selectTargetReaction(source)).toBeNull();
    expect(selectTargetMolecule(source)).toBeNull();
  });
});
