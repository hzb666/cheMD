import { describe, expect, it } from "vitest";

import { insertMoleculeBlock } from "../src/features/ocr/lib/insert-molecule-block";
import { selectTargetMolecule } from "../src/features/ocr/lib/select-target-molecule";
import { updateMoleculeBlock } from "../src/features/ocr/lib/update-molecule-block";

describe("ocr molecule writeback", () => {
  it("updates smiles for existing target molecule block", () => {
    const source = `---\nid: exp-1\n---\n\n:::molecule #mol-a\nsmiles: CCO\n:::`;

    const target = selectTargetMolecule(source);
    expect(target?.blockId).toBe("mol-a");

    const next = updateMoleculeBlock(source, "mol-a", "CCN");
    expect(next).toContain(":::molecule #mol-a");
    expect(next).toContain("smiles: CCN");
    expect(next).not.toContain("smiles: CCO");
  });

  it("appends molecule block when target does not exist", () => {
    const source = `---\nid: exp-2\n---\n\n# note`;
    const next = insertMoleculeBlock(source, "mol-b", "O=C=O");

    expect(next).toContain(":::molecule #mol-b");
    expect(next).toContain("smiles: O=C=O");
  });

  it("does not guess a target when the document has multiple molecule blocks", () => {
    const source = `---
id: exp-3
---

:::molecule #mol-a
smiles: CCO
:::

:::molecule #mol-b
smiles: CCN
:::`;

    expect(selectTargetMolecule(source)).toBeNull();
  });

  it("assigns a stable synthetic id to a unique molecule block without an explicit id", () => {
    const source = `:::molecule
smiles: CCO
:::`;

    expect(selectTargetMolecule(source)?.blockId).toBe("mol-missing-id-1");
  });

  it("updates a unique molecule block without an explicit id and promotes it to a stable header id", () => {
    const source = `:::molecule
smiles: CCO
:::`;

    const next = updateMoleculeBlock(source, "mol-missing-id-1", "CCN");

    expect(next).toContain(":::molecule #mol-missing-id-1");
    expect(next).toContain("smiles: CCN");
    expect(next).not.toContain("smiles: CCO");
  });
});
