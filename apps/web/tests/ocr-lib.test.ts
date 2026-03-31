import { describe, expect, it } from "vitest";

import { selectTargetMolecule } from "../src/features/ocr/lib/select-target-molecule";
import { insertMoleculeBlock } from "../src/features/ocr/lib/insert-molecule-block";
import { updateMoleculeBlock } from "../src/features/ocr/lib/update-molecule-block";
import { ensureBlockId } from "../src/features/ocr/lib/ensure-block-id";

const SOURCE_WITH_MOLECULE = `---
id: doc-1
title: Test
---

:::molecule #mol-001
smiles: CCO
:::
`;

const SOURCE_WITHOUT_MOLECULE = `---
id: doc-1
title: Test
---

# Introduction
`;

const SOURCE_WITHOUT_SMILES = `---
id: doc-1
title: Test
---

:::molecule #mol-002
:::
`;

describe("selectTargetMolecule", () => {
  it("returns null when there are no molecule blocks", () => {
    expect(selectTargetMolecule(SOURCE_WITHOUT_MOLECULE)).toBeNull();
  });

  it("returns the block info when a molecule block exists", () => {
    const result = selectTargetMolecule(SOURCE_WITH_MOLECULE);
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe("mol-001");
    expect(result!.hasSmiles).toBe(true);
  });

  it("prefers a block without smiles", () => {
    const result = selectTargetMolecule(SOURCE_WITHOUT_SMILES);
    expect(result!.blockId).toBe("mol-002");
    expect(result!.hasSmiles).toBe(false);
  });
});

describe("insertMoleculeBlock", () => {
  it("appends a new molecule block to the source", () => {
    const result = insertMoleculeBlock(SOURCE_WITHOUT_MOLECULE, "c1ccccc1", "mol-new");
    expect(result).toContain(":::molecule #mol-new");
    expect(result).toContain("smiles: c1ccccc1");
    expect(result).toContain(":::");
  });
});

describe("updateMoleculeBlock", () => {
  it("replaces the existing smiles value", () => {
    const target = selectTargetMolecule(SOURCE_WITH_MOLECULE)!;
    const result = updateMoleculeBlock(SOURCE_WITH_MOLECULE, target, "c1ccccc1");
    expect(result).toContain("smiles: c1ccccc1");
    expect(result).not.toContain("smiles: CCO");
  });

  it("inserts a smiles line when none exists", () => {
    const target = selectTargetMolecule(SOURCE_WITHOUT_SMILES)!;
    const result = updateMoleculeBlock(SOURCE_WITHOUT_SMILES, target, "CCO");
    expect(result).toContain("smiles: CCO");
  });
});

describe("ensureBlockId", () => {
  it("preserves existing id", () => {
    const lines = SOURCE_WITH_MOLECULE.split("\n");
    const lineStart = lines.findIndex((l) => l.startsWith(":::molecule"));
    const { source, blockId } = ensureBlockId(SOURCE_WITH_MOLECULE, lineStart);
    expect(blockId).toBe("mol-001");
    expect(source).toBe(SOURCE_WITH_MOLECULE);
  });

  it("assigns a new id when none exists", () => {
    const srcNoId = `:::molecule\nsmiles: CCO\n:::\n`;
    const { source, blockId } = ensureBlockId(srcNoId, 0, "mol");
    expect(blockId).toMatch(/^mol-\d+$/);
    expect(source).toContain(`:::molecule #${blockId}`);
  });
});
