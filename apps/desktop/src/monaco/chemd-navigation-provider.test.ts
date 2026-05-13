import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";
import { compileChemdForEditor } from "@chemd/language-service";
import type { WorkspaceSymbolIndex } from "@chemd/workspace-index";

import {
  getChemdDiagnosticHoverMarkdown,
  getChemdHoverMarkdown,
  getChemdReferenceHoverMarkdown,
  getChemdTemplateHoverMarkdown,
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
  getLineContent: (lineNumber: number) => source.split("\n")[lineNumber - 1] ?? source
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

  it("builds diagnostic hover markdown with quick fix count", () => {
    const output = compileChemdForEditor({
      source: [
        ":::chemd #mol-open",
        "smiles: CCO",
        ":::"
      ].join("\n")
    });
    const diagnostic = output.diagnostics.find((item) =>
      item.quickFixes.length > 0
    );

    expect(diagnostic).toBeDefined();
    const markdown = getChemdDiagnosticHoverMarkdown(diagnostic!);

    expect(markdown).toContain(`**${diagnostic?.code}**`);
    expect(markdown).toContain(diagnostic?.message);
    expect(markdown).toContain(`quick fixes: \`${diagnostic?.quickFixes.length}\``);
  });

  it("builds template hover markdown with params", () => {
    const markdown = getChemdTemplateHoverMarkdown({
      type: "template",
      name: "charge_pair",
      params: ["reagent_a", "amount"],
      paramSpecs: [
        { name: "reagent_a", raw: "reagent_a: ref<molecule>" },
        { name: "amount", raw: "amount: quantity<amount>" }
      ]
    });

    expect(markdown).toContain("**charge_pair**");
    expect(markdown).toContain("`reagent_a: ref<molecule>`");
    expect(markdown).toContain("`amount: quantity<amount>`");
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

  it("returns diagnostic hover over a diagnostic range", async () => {
    const hoverProviders: languages.HoverProvider[] = [];
    const monaco = {
      languages: {
        registerHoverProvider: (_languageId: string, provider: languages.HoverProvider) => {
          hoverProviders.push(provider);
          return { dispose: () => undefined };
        },
        registerDefinitionProvider: () => ({ dispose: () => undefined }),
        registerReferenceProvider: () => ({ dispose: () => undefined })
      }
    } as unknown as Monaco;
    const source = [
      ":::chemd #mol-open",
      "smiles: CCO",
      ":::"
    ].join("\n");
    const output = compileChemdForEditor({ source });
    const diagnostic = output.diagnostics.find((item) =>
      item.quickFixes.length > 0
    );

    expect(diagnostic).toBeDefined();
    const disposable = registerChemdNavigationProviders(monaco, "chemd", {
      getCompileOutput: () => output,
      getWorkspaceIndex: () => fakeIndex
    });
    const hover = await hoverProviders[0].provideHover(
      fakeModel(source),
      {
        lineNumber: diagnostic!.range.startLine,
        column: diagnostic!.range.startColumn
      } as Position,
      {} as never
    );

    expect(hover?.contents[0].value).toContain(diagnostic?.code);
    expect(hover?.contents[0].value).toContain(`quick fixes: \`${diagnostic?.quickFixes.length}\``);
    disposable.dispose();
  });

  it("returns template params hover over a template name", async () => {
    const hoverProviders: languages.HoverProvider[] = [];
    const monaco = {
      languages: {
        registerHoverProvider: (_languageId: string, provider: languages.HoverProvider) => {
          hoverProviders.push(provider);
          return { dispose: () => undefined };
        },
        registerDefinitionProvider: () => ({ dispose: () => undefined }),
        registerReferenceProvider: () => ({ dispose: () => undefined })
      }
    } as unknown as Monaco;
    const source = [
      "---",
      "id: template-doc",
      "title: Template Doc",
      "---",
      "",
      ":::template charge_pair",
      "params: reagent_a: ref<molecule> | amount: quantity<amount>",
      "description: Charge pair template",
      ":::"
    ].join("\n");
    const output = compileChemdForEditor({ source });
    const disposable = registerChemdNavigationProviders(monaco, "chemd", {
      getCompileOutput: () => output,
      getWorkspaceIndex: () => fakeIndex
    });
    const templateLine = 6;
    const hover = await hoverProviders[0].provideHover(
      fakeModel(source),
      { lineNumber: templateLine, column: 16 } as Position,
      {} as never
    );

    expect(output.status).toBe("ok");
    expect(hover?.contents[0].value).toContain("**charge_pair**");
    expect(hover?.contents[0].value).toContain("`reagent_a: ref<molecule>`");
    expect(hover?.contents[0].value).toContain("`amount: quantity<amount>`");
    disposable.dispose();
  });
});
