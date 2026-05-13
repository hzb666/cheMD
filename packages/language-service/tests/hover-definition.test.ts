import { describe, expect, it } from "vitest";

import {
  compileChemdForEditor,
  getChemdDefinition,
  getChemdHover
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

const source = `---
id: exp-hover-definition
title: Hover definition
date: 2026-05-13
---

:::chemd #mol-main
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-main
products: product-main
:::
`;

describe("getChemdHover", () => {
  it("returns symbol metadata and source line at the current position", () => {
    const marked = source.replace("#mol-main", "#mol|-main");
    const request = withCursor(marked);
    const compileOutput = compileChemdForEditor({ source: request.source });
    const hover = getChemdHover(request, { compileOutput });

    expect(hover).toMatchObject({
      symbol: {
        id: "mol-main",
        kind: "molecule",
        sourceNodeType: "molecule"
      },
      sourceLine: {
        line: 7,
        text: ":::chemd #mol-main"
      }
    });
  });

  it("returns diagnostics at the current position without throwing", () => {
    const marked = source.replace("#mol-main", "#mol|-main");
    const request = withCursor(marked);
    const compileOutput = compileChemdForEditor({ source: request.source });
    const symbol = compileOutput.symbols.find((item) => item.id === "mol-main");
    compileOutput.diagnostics = [{
      code: "W_CHEMD_KIND_AMBIGUOUS",
      severity: "warning",
      message: "Molecule block should declare kind explicitly",
      range: symbol?.range ?? {
        startLine: 7,
        startColumn: 1,
        endLine: 10,
        endColumn: 4
      },
      sourceNodeId: "mol-main",
      quickFixes: []
    }];
    const hover = getChemdHover(request, { compileOutput });

    expect(hover?.diagnostic).toMatchObject({
      code: "W_CHEMD_KIND_AMBIGUOUS",
      severity: "warning",
      sourceNodeId: "mol-main"
    });
  });

  it("returns reference target information for symbol references", () => {
    const marked = source.replace("@mol-main", "@mol|-main");
    const request = withCursor(marked);
    const compileOutput = compileChemdForEditor({ source: request.source });
    const hover = getChemdHover(request, { compileOutput });

    expect(hover).toMatchObject({
      referenceTarget: {
        id: "mol-main",
        kind: "molecule",
        explicitReference: true,
        tokenRange: {
          startLine: 14,
          startColumn: 12
        }
      }
    });
  });

  it("returns null when no compile output or hover data is available", () => {
    expect(getChemdHover({ source: "plain text", position: { line: 1, column: 1 } }))
      .toBeNull();

    const compileOutput = compileChemdForEditor({ source: "plain text" });
    expect(getChemdHover({
      source: "plain text",
      position: { line: 1, column: 1 }
    }, { compileOutput })).toBeNull();
  });
});

describe("getChemdDefinition", () => {
  it("returns the current document definition for reference tokens", () => {
    const marked = source.replace("@mol-main", "@mol|-main");
    const request = withCursor(marked);
    const compileOutput = compileChemdForEditor({
      source: request.source,
      documentUri: "file:///workspace/hover.chemd"
    });
    const definitions = getChemdDefinition({
      ...request,
      documentUri: "file:///workspace/hover.chemd",
      documentPath: "D:/workspace/hover.chemd"
    }, { compileOutput });

    expect(definitions).toEqual([expect.objectContaining({
      uri: "file:///workspace/hover.chemd",
      path: "D:/workspace/hover.chemd",
      range: expect.objectContaining({
        startLine: 7,
        startColumn: 1
      }),
      sourceSpan: expect.objectContaining({
        startLine: 7,
        startColumn: 1
      }),
      target: {
        symbolId: "mol-main",
        label: "mol-main",
        kind: "molecule",
        sourceNodeType: "molecule"
      }
    })]);
  });

  it("returns the current document definition for bare symbol id tokens", () => {
    const marked = source.replace("@mol-main", "mol|-main");
    const request = withCursor(marked);
    const compileOutput = compileChemdForEditor({ source: request.source });
    const definitions = getChemdDefinition(request, { compileOutput });

    expect(definitions[0]?.target).toMatchObject({
      symbolId: "mol-main",
      kind: "molecule"
    });
  });

  it("returns an empty list when compile output or target symbol is missing", () => {
    const request = withCursor("reactants: @missing|");
    const compileOutput = compileChemdForEditor({ source });

    expect(getChemdDefinition(request)).toEqual([]);
    expect(getChemdDefinition(request, { compileOutput })).toEqual([]);
  });
});
