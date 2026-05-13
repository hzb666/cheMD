import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";
import type { WorkspaceSymbolIndex } from "@chemd/workspace-index";

import {
  getChemdHoverMarkdown,
  getChemdReferenceHoverMarkdown,
  registerChemdNavigationProviders
} from "./chemd-navigation-provider";

const fakeIndex: WorkspaceSymbolIndex = {
  version: "chemd-workspace-symbol-index/v0.1",
  generatedAt: "2026-05-13T00:00:00.000Z",
  documents: [{
    uri: "chemd-workspace://workspace/route-a.chemd.md",
    path: "route-a.chemd.md",
    sourceHash: "hash-a",
    status: "ok"
  }],
  symbols: [{
    symbolId: "chemd-workspace://workspace/route-a.chemd.md#rxn-a",
    documentUri: "chemd-workspace://workspace/route-a.chemd.md",
    documentPath: "route-a.chemd.md",
    localId: "rxn-a",
    label: "rxn-a",
    kind: "reaction",
    range: {
      startLine: 7,
      startColumn: 1,
      endLine: 10,
      endColumn: 4
    },
    sourceHash: "hash-a",
    duplicateLocalId: false
  }],
  references: [{
    referenceId: "ref-1",
    documentUri: "chemd-workspace://workspace/route-a.chemd.md",
    documentPath: "route-a.chemd.md",
    field: "reaction",
    rawText: "rxn-a",
    targetText: "rxn-a",
    targetLocalId: "rxn-a",
    range: {
      startLine: 14,
      startColumn: 11,
      endLine: 14,
      endColumn: 16
    },
    status: "resolved",
    targetSymbolIds: ["chemd-workspace://workspace/route-a.chemd.md#rxn-a"]
  }],
  diagnostics: []
};

const fakeModel = (source: string): editor.ITextModel => ({
  uri: { toString: () => "chemd-workspace://workspace/route-a.chemd.md" },
  getWordAtPosition: () => ({ word: "rxn-a" }),
  getLineContent: () => source
} as unknown as editor.ITextModel);

const fakePosition: Position = {
  lineNumber: 14,
  column: 16
} as Position;

describe("chemd Monaco navigation providers", () => {
  it("builds hover markdown from workspace symbols", () => {
    expect(getChemdHoverMarkdown(fakeIndex.symbols[0])).toContain("**rxn-a**");
    expect(getChemdHoverMarkdown(fakeIndex.symbols[0])).toContain("kind: `reaction`");
  });

  it("builds hover markdown for unresolved references", () => {
    const markdown = getChemdReferenceHoverMarkdown({
      ...fakeIndex.references[0],
      status: "unresolved",
      targetText: "missing-rxn",
      targetSymbolIds: []
    });

    expect(markdown).toContain("**missing-rxn**");
    expect(markdown).toContain("status: `unresolved`");
  });

  it("registers hover, definition, and reference providers from workspace index", async () => {
    const hoverProviders: languages.HoverProvider[] = [];
    const definitionProviders: languages.DefinitionProvider[] = [];
    const referenceProviders: languages.ReferenceProvider[] = [];
    const disposals: string[] = [];
    const monaco = {
      Range: class {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;

        constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
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
          return { dispose: () => disposals.push("hover") };
        },
        registerDefinitionProvider: (_languageId: string, provider: languages.DefinitionProvider) => {
          definitionProviders.push(provider);
          return { dispose: () => disposals.push("definition") };
        },
        registerReferenceProvider: (_languageId: string, provider: languages.ReferenceProvider) => {
          referenceProviders.push(provider);
          return { dispose: () => disposals.push("reference") };
        }
      }
    } as unknown as Monaco;

    const disposable = registerChemdNavigationProviders(monaco, "chemd", {
      getCompileOutput: () => undefined,
      getWorkspaceIndex: () => fakeIndex
    });
    const model = fakeModel("reaction: rxn-a");
    const hover = await hoverProviders[0].provideHover(model, fakePosition, {} as never);
    const definition = await definitionProviders[0].provideDefinition(model, fakePosition, {} as never);
    const references = await referenceProviders[0].provideReferences(model, fakePosition, {} as never, {} as never);

    expect(hover?.contents[0].value).toContain("rxn-a");
    expect(definition).toEqual([
      expect.objectContaining({
        uri: expect.objectContaining({ toString: expect.any(Function) })
      })
    ]);
    expect(references).toHaveLength(2);
    disposable.dispose();
    expect(disposals).toEqual(["hover", "definition", "reference"]);
  });
});
