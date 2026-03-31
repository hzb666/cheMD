import { describe, expect, it } from "vitest";

import { getSelectedBlock } from "../src/features/editor/lib/selected-block";

const SOURCE = `---
id: doc-1
---

# Intro

Some text.

:::molecule #mol-001
smiles: CCO
:::

More text.

:::molecule #mol-002
smiles: c1ccccc1
:::
`;

describe("getSelectedBlock", () => {
  it("returns null when cursor is outside all blocks", () => {
    // Line 0 is the "---" frontmatter line
    expect(getSelectedBlock(SOURCE, 0)).toBeNull();
  });

  it("identifies the first molecule block", () => {
    const lines = SOURCE.split("\n");
    const blockStart = lines.findIndex((l) => l === ":::molecule #mol-001");
    const result = getSelectedBlock(SOURCE, blockStart + 1); // inside the block
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe("mol-001");
    expect(result!.smiles).toBe("CCO");
  });

  it("identifies the second molecule block", () => {
    const lines = SOURCE.split("\n");
    const blockStart = lines.findIndex((l) => l === ":::molecule #mol-002");
    const result = getSelectedBlock(SOURCE, blockStart);
    expect(result).not.toBeNull();
    expect(result!.blockId).toBe("mol-002");
    expect(result!.smiles).toBe("c1ccccc1");
  });

  it("returns null when cursor is between blocks", () => {
    const lines = SOURCE.split("\n");
    const betweenLine = lines.findIndex((l) => l === "More text.");
    expect(getSelectedBlock(SOURCE, betweenLine)).toBeNull();
  });
});
