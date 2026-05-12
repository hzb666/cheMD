import { describe, expect, it } from "vitest";

import { getChemdCompletions } from "../src/index";

const withCursor = (source: string): { source: string; cursorOffset: number } => {
  const cursorOffset = source.indexOf("|");
  if (cursorOffset < 0) {
    throw new Error("Missing cursor marker");
  }

  return {
    source: source.slice(0, cursorOffset) + source.slice(cursorOffset + 1),
    cursorOffset
  };
};

const labelsFor = (source: string): string[] =>
  getChemdCompletions(withCursor(source)).items.map((item) => item.label);

describe("getChemdCompletions", () => {
  it("returns reaction and molecule snippets without Monaco types", () => {
    const items = getChemdCompletions({ source: "", cursorOffset: 0 }).items;

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "snippet.chemd.reaction",
        label: "chemd reaction",
        kind: "snippet",
        insertTextFormat: "snippet",
        insertText: expect.stringContaining("kind: reaction")
      }),
      expect.objectContaining({
        id: "snippet.chemd.molecule",
        label: "chemd molecule",
        kind: "snippet",
        insertText: expect.stringContaining("kind: molecule")
      })
    ]));
  });

  it("suggests kind values inside chemd blocks", () => {
    expect(labelsFor(`:::chemd #draft
kind: |
:::`)).toEqual(["molecule", "reaction"]);
  });

  it("suggests reaction stage values", () => {
    expect(labelsFor(`:::chemd #rxn-main
kind: reaction
stage: |
:::`)).toEqual([
      "reaction_setup",
      "reaction",
      "workup",
      "purification",
      "analysis"
    ]);
  });

  it("suggests reaction block fields and omits existing fields", () => {
    const labels = labelsFor(`:::chemd #rxn-main
kind: reaction
|
:::`);

    expect(labels).toEqual(expect.arrayContaining([
      "reactants:",
      "products:",
      "stage:"
    ]));
    expect(labels).not.toContain("kind:");
  });

  it("suggests molecule block fields", () => {
    expect(labelsFor(`:::chemd #mol-main
kind: molecule
|
:::`)).toEqual(expect.arrayContaining([
      "smiles:",
      "cas:",
      "amount:"
    ]));
  });

  it("does not offer completions inside frontmatter", () => {
    expect(labelsFor(`---
title: |
---
`)).toEqual([]);
  });

  it("keeps prose completions low priority outside Chemd context", () => {
    const items = getChemdCompletions(withCursor("This is prose|")).items;

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.sortText?.startsWith("z-"))).toBe(true);
  });
});
