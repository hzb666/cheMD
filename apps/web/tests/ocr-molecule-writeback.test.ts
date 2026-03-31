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
});
