import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  getChemdCompletions
} from "../src/index";

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
        insertText: expect.stringContaining("reactant: ${2:@mol-a}")
      }),
      expect.objectContaining({
        id: "snippet.chemd.molecule",
        label: "chemd molecule",
        kind: "snippet",
        insertText: expect.stringContaining("smiles: ${3:SMILES}")
      })
    ]));
    const reactionSnippet = items.find((item) => item.id === "snippet.chemd.reaction");
    const moleculeSnippet = items.find((item) => item.id === "snippet.chemd.molecule");
    expect(reactionSnippet?.insertText).not.toContain("kind:");
    expect(reactionSnippet?.insertText).not.toContain("reactants:");
    expect(reactionSnippet?.insertText).not.toContain("products:");
    expect(moleculeSnippet?.insertText).not.toContain("kind:");
  });

  it("suggests kind values inside chemd blocks", () => {
    expect(labelsFor(`:::chemd #draft
kind: |
:::`)).toEqual(["molecule", "reaction"]);
  });

  it("keeps current value completion registry behavior visible before schema migration", () => {
    expect(labelsFor(`:::result #res-main
status: p|
:::`)).toEqual(["partial", "pending"]);
    expect(labelsFor(`:::procedure #proc-main
step: |
:::`)).toEqual(expect.arrayContaining(["add", "stir", "analyze"]));
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

  it("suggests procedure step family values", () => {
    expect(labelsFor(`:::procedure #proc-main
step: hea|
:::`)).toEqual(["heat"]);
  });

  it("suggests step parameters from the StepFamily schema", () => {
    const source = `:::procedure #proc-main
step: heat | temp
:::`;

    expect(getChemdCompletions({
      source,
      cursorOffset: source.indexOf("temp") + "temp".length
    }).items.map((item) => item.label)).toEqual(["temperature="]);
  });

  it("filters current-document references by field context", () => {
    const compileOutput = compileChemdForEditor({
      source: `---
id: exp-completion
title: Completion
date: 2026-05-13
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-a
kind: reaction
reactants: @mol-a
products: product-a
:::
`
    });
    const items = getChemdCompletions({
      ...withCursor(`:::chemd #rxn-edit
kind: reaction
reactants: @|
:::`),
      documentUri: "file:///current.chemd",
      compileOutput,
      triggerKind: "trigger-character",
      triggerCharacter: "@"
    }).items;

    expect(items.map((item) => item.label)).toContain("mol-a");
    expect(items.map((item) => item.label)).not.toContain("rxn-a");
    expect(items.find((item) => item.label === "mol-a")).toMatchObject({
      kind: "reference",
      insertText: "@mol-a",
      range: {
        startLine: 3,
        startColumn: 12,
        endLine: 3,
        endColumn: 13
      }
    });
  });

  it("suggests reaction block fields and omits existing fields", () => {
    const labels = labelsFor(`:::chemd #rxn-main
kind: reaction
|
:::`);

    expect(labels).toEqual(expect.arrayContaining([
      "reactant:",
      "product:",
      "rxn_smiles:",
      "route:"
    ]));
    expect(labels).not.toContain("reactants:");
    expect(labels).not.toContain("products:");
    expect(labels).not.toContain("kind:");
  });

  it("offers field aliases only when the alias prefix is typed", () => {
    const items = getChemdCompletions(withCursor(`:::chemd #rxn-main
kind: reaction
reaction_|
:::`)).items;

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "reaction_smiles:",
        detail: "alias of rxn_smiles",
        data: {
          type: "field",
          canonicalName: "rxn_smiles",
          aliasOf: "rxn_smiles"
        }
      })
    ]));
  });

  it("suggests molecule block fields", () => {
    expect(labelsFor(`:::chemd #mol-main
kind: molecule
|
:::`)).toEqual(expect.arrayContaining([
      "smiles:",
      "cas:",
      "inchi:",
      "inchikey:",
      "canonical_smiles:",
      "mw:"
    ]));
    expect(labelsFor(`:::chemd #mol-main
kind: molecule
|
:::`)).not.toContain("amount:");
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

  it("suggests current document symbol references from compile output", () => {
    const source = `---
id: exp-completion
title: Completion
---

:::chemd #mol-main
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-main
products: @mol-main
:::

Related: @|
`;
    const { source: cleanSource, cursorOffset } = withCursor(source);
    const compileOutput = compileChemdForEditor({ source: cleanSource });
    const items = getChemdCompletions({
      source: cleanSource,
      cursorOffset,
      compileOutput
    }).items;

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "reference.chemd.mol-main",
        label: "mol-main",
        kind: "reference",
        insertText: "@mol-main",
        data: {
          type: "reference",
          symbolId: "mol-main",
          symbolKind: "molecule"
        }
      })
    ]));
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "reference.chemd.rxn-main",
        label: "rxn-main",
        kind: "reference",
        insertText: "@rxn-main"
      })
    ]));
  });

  it("suggests references in reference value positions without an at token", () => {
    const source = `:::chemd #mol-main
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: |
:::
`;
    const { source: cleanSource, cursorOffset } = withCursor(source);
    const compileOutput = compileChemdForEditor({ source: cleanSource });
    const items = getChemdCompletions({
      source: cleanSource,
      cursorOffset,
      compileOutput
    }).items;

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "mol-main",
        kind: "reference",
        insertText: "@mol-main"
      })
    ]));
    expect(items.map((item) => item.label)).not.toContain("rxn-main");
  });

  it("does not flood ordinary prose with reference suggestions", () => {
    const source = `:::chemd #mol-main
kind: molecule
smiles: CCO
:::

This is prose|
`;
    const { source: cleanSource, cursorOffset } = withCursor(source);
    const compileOutput = compileChemdForEditor({ source: cleanSource });
    const items = getChemdCompletions({
      source: cleanSource,
      cursorOffset,
      compileOutput
    }).items;

    expect(items.some((item) => item.kind === "reference")).toBe(false);
  });

  it("does not throw or suggest references without compile output", () => {
    const items = getChemdCompletions(withCursor(`:::chemd #rxn-main
kind: reaction
reactants: @|
:::`)).items;

    expect(items.some((item) => item.kind === "reference")).toBe(false);
  });
});
