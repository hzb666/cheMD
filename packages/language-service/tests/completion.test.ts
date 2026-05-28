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
        insertText: expect.stringContaining("reaction rxn_${1:id}")
      }),
      expect.objectContaining({
        id: "snippet.chemd.molecule",
        label: "chemd molecule",
        kind: "snippet",
        insertText: expect.stringContaining("smiles: ${3:\"SMILES\"}")
      })
    ]));
  });

  it("keeps schema-derived value completion behavior on program declarations", () => {
    expect(labelsFor(`result res-main {
  status: p|
}`)).toEqual(["partial"]);
    expect(labelsFor(`procedure proc-main {
  step next = |
}`)).toEqual(expect.arrayContaining(["add", "analyze", "heat"]));
  });

  it("suggests enum values from the shared field value schema", () => {
    expect(labelsFor(`reaction rxn-main {
  atmosphere: ar|
}`)).toEqual(["argon"]);
  });

  it("does not apply global enum fallbacks to scoped non-enum fields", () => {
    expect(labelsFor(`trace trace-main {
  type: lc|
}`)).toEqual([]);
  });

  it("suggests procedure step family values", () => {
    expect(labelsFor(`procedure proc-main {
  step next = hea|
}`)).toEqual(["heat"]);
  });

  it("suggests step parameters from the StepFamily schema", () => {
    const source = `procedure proc-main {
  step heat = heat(temp
}`;

    expect(getChemdCompletions({
      source,
      cursorOffset: source.indexOf("temp") + "temp".length
    }).items.map((item) => item.label)).toEqual(["temperature="]);
  });

  it("filters current-document references by field context", () => {
    const compileOutput = compileChemdForEditor({
      source: `module exp_completion

meta {
  id: "exp-completion"
  title: "Completion"
  date: "2026-05-13"
}

molecule mol-a {
  name: "mol a"
  smiles: "CCO"
}

reaction rxn-a {
  reactants: [@mol-a]
  products: ["product-a"]
}
`
    });
    const items = getChemdCompletions({
      ...withCursor(`reaction rxn-edit {
  reactants: @|
}`),
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
        startLine: 2,
        startColumn: 14,
        endLine: 2,
        endColumn: 15
      }
    });
  });

  it("suggests reaction declaration fields and omits existing fields", () => {
    const labels = labelsFor(`reaction rxn-main {
  |
}`);

    expect(labels).toEqual(expect.arrayContaining([
      "reactants:",
      "products:",
      "rxn_smiles:",
      "route:"
    ]));
    expect(labels).not.toContain("kind:");
  });

  it("offers field aliases only when the alias prefix is typed", () => {
    const items = getChemdCompletions(withCursor(`reaction rxn-main {
  reaction_|
}`)).items;

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

  it("suggests molecule declaration fields", () => {
    expect(labelsFor(`molecule mol-main {
  |
}`)).toEqual(expect.arrayContaining([
      "name:",
      "smiles:",
      "role:",
      "formula:",
      "cas:",
      "inchi:",
      "inchikey:"
    ]));
    expect(labelsFor(`molecule mol-main {
  |
}`)).not.toContain("amount:");
  });

  it("does not offer completions inside legacy frontmatter", () => {
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
    const source = `module exp_completion

meta {
  id: "exp-completion"
  title: "Completion"
}

molecule mol-main {
  name: "main"
  smiles: "CCO"
}

reaction rxn-main {
  reactants: [@mol-main]
  products: [@mol-main]
}

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
      }),
      expect.objectContaining({
        id: "reference.chemd.rxn-main",
        label: "rxn-main",
        kind: "reference",
        insertText: "@rxn-main"
      })
    ]));
  });

  it("suggests references in reference value positions without an at token", () => {
    const source = `module exp_completion

meta {
  id: "exp-completion"
  title: "Completion"
}

molecule mol-main {
  name: "main"
  smiles: "CCO"
}

reaction rxn-main {
  reactants: |
}
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
    const source = `module exp_completion

meta {
  id: "exp-completion"
  title: "Completion"
}

molecule mol-main {
  name: "main"
  smiles: "CCO"
}

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
    const items = getChemdCompletions(withCursor(`reaction rxn-main {
  reactants: @|
}`)).items;

    expect(items.some((item) => item.kind === "reference")).toBe(false);
  });
});
