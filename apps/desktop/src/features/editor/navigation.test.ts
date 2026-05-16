import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";

import { compileChemdForEditor } from "@chemd/language-service";
import {
  cleanupChemdNavigationOutput,
  getChemdHoverMarkdown,
  registerChemdNavigationProviders,
  updateChemdNavigationOutput
} from "./navigation";

const source = `---
id: exp-monaco-navigation
title: Monaco navigation
date: 2026-05-13
---

:::chemd #mol-main
kind: molecule
smiles: CCO
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-main
:::
`;

const withCursor = (input: string): { source: string; position: Position } => {
  const cursorOffset = input.indexOf("|");
  if (cursorOffset < 0) {
    throw new Error("Missing cursor marker");
  }

  const cleanSource = input.slice(0, cursorOffset) + input.slice(cursorOffset + 1);
  return {
    source: cleanSource,
    position: toPosition(cleanSource, cursorOffset)
  };
};

const toPosition = (text: string, offset: number): Position => {
  const prefix = text.slice(0, offset);
  const lines = prefix.split("\n");
  return {
    lineNumber: lines.length,
    column: lines[lines.length - 1].length + 1
  } as Position;
};

const toOffset = (text: string, position: Position): number => {
  const lines = text.split("\n");
  return lines.slice(0, position.lineNumber - 1)
    .reduce((offset, line) => offset + line.length + 1, 0)
    + position.column - 1;
};

const createModel = (
  text: string,
  documentUri: string
): editor.ITextModel => ({
  uri: {
    path: "/hover-definition.chemd.md",
    toString: () => documentUri
  },
  getValue: () => text,
  getOffsetAt: (position: Position) => toOffset(text, position)
} as unknown as editor.ITextModel);

const createMonaco = (
  hoverProviders: languages.HoverProvider[],
  definitionProviders: languages.DefinitionProvider[]
): Monaco => ({
  Range: class {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;

    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number
    ) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  Uri: {
    parse: (value: string) => ({ toString: () => value })
  },
  languages: {
    registerHoverProvider: (_languageId: string, provider: languages.HoverProvider) => {
      hoverProviders.push(provider);
      return { dispose: () => undefined };
    },
    registerDefinitionProvider: (
      _languageId: string,
      provider: languages.DefinitionProvider
    ) => {
      definitionProviders.push(provider);
      return { dispose: () => undefined };
    }
  }
} as unknown as Monaco);

describe("chemd Monaco navigation providers", () => {
  it("builds compact hover markdown for reference targets", () => {
    const markdown = getChemdHoverMarkdown({
      position: { line: 14, column: 18 },
      range: {
        startLine: 14,
        startColumn: 12,
        endLine: 14,
        endColumn: 21
      },
      sourceLine: {
        line: 14,
        text: "reactants: @mol-main"
      },
      referenceTarget: {
        id: "mol-main",
        label: "mol-main",
        kind: "molecule",
        range: {
          startLine: 7,
          startColumn: 1,
          endLine: 10,
          endColumn: 4
        },
        tokenRange: {
          startLine: 14,
          startColumn: 12,
          endLine: 14,
          endColumn: 21
        },
        explicitReference: true
      }
    });

    expect(markdown).toContain("**mol-main**");
    expect(markdown).toContain("kind: `molecule`");
    expect(markdown).toContain("reference: `explicit`");
  });

  it("registers providers once and maps current document navigation", async () => {
    const hoverProviders: languages.HoverProvider[] = [];
    const definitionProviders: languages.DefinitionProvider[] = [];
    const monaco = createMonaco(hoverProviders, definitionProviders);
    const documentUri = "chemd://desktop/hover-definition.chemd.md";
    const marked = withCursor(source.replace("@mol-main", "@mol|-main"));
    const model = createModel(marked.source, documentUri);
    const compileOutput = compileChemdForEditor({
      source: marked.source,
      documentUri
    });

    updateChemdNavigationOutput(documentUri, compileOutput);
    registerChemdNavigationProviders(monaco, "chemd");
    registerChemdNavigationProviders(monaco, "chemd");

    const hover = await hoverProviders[0].provideHover(model, marked.position, {} as never);
    const definition = await definitionProviders[0].provideDefinition(
      model,
      marked.position,
      {} as never
    );

    expect(hoverProviders).toHaveLength(1);
    expect(definitionProviders).toHaveLength(1);
    expect(hover?.contents[0].value).toContain("mol-main");
    expect(definition).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          startLineNumber: 7,
          startColumn: 1
        })
      })
    ]);

    cleanupChemdNavigationOutput(documentUri, compileOutput);
  });
});
