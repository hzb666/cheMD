import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";

import {
  buildChemdWorkspaceSymbolIndex,
  compileChemdForEditor
} from "@chemd/language-service";
import {
  cleanupChemdCompletionOutput,
  cleanupChemdCompletionWorkspaceIndex,
  registerChemdCompletionProvider,
  updateChemdCompletionOutput,
  updateChemdCompletionWorkspaceIndex
} from "./completion";

type CompletionWithData = languages.CompletionItem & {
  data?: {
    type?: string;
  };
};

const currentSource = `:::chemd #mol-current
kind: molecule
smiles: CCO
:::

:::chemd #rxn-current
kind: reaction
reactants: @|
:::
`;

const librarySource = `:::chemd #mol-lib
kind: molecule
smiles: CCN
:::
`;

const withCursor = (input: string): { source: string; position: Position } => {
  const cursorOffset = input.indexOf("|");
  if (cursorOffset < 0) {
    throw new Error("Missing cursor marker");
  }

  const source = input.slice(0, cursorOffset) + input.slice(cursorOffset + 1);
  return {
    source,
    position: toPosition(source, cursorOffset)
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
    path: "/completion.chemd",
    toString: () => documentUri
  },
  getValue: () => text,
  getOffsetAt: (position: Position) => toOffset(text, position)
} as unknown as editor.ITextModel);

const createContext = (
  monaco: Monaco
): languages.CompletionContext => ({
  triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter,
  triggerCharacter: "@"
});

const createMonaco = (
  providers: languages.CompletionItemProvider[]
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
  languages: {
    CompletionTriggerKind: {
      TriggerCharacter: 1
    },
    CompletionItemKind: {
      Snippet: 27,
      Field: 4,
      Value: 12,
      Reference: 17
    },
    CompletionItemInsertTextRule: {
      InsertAsSnippet: 4
    },
    registerCompletionItemProvider: (
      _languageId: string,
      provider: languages.CompletionItemProvider
    ) => {
      providers.push(provider);
      return { dispose: () => undefined };
    }
  }
} as unknown as Monaco);

const getSuggestions = async (
  provider: languages.CompletionItemProvider,
  model: editor.ITextModel,
  position: Position,
  context: languages.CompletionContext
): Promise<CompletionWithData[]> => {
  const result = await provider.provideCompletionItems(model, position, context, {} as never);
  return (result?.suggestions ?? []) as CompletionWithData[];
};

describe("chemd Monaco completion provider", () => {
  it("registers once and merges local completions with cached workspace references", async () => {
    const providers: languages.CompletionItemProvider[] = [];
    const monaco = createMonaco(providers);
    const documentUri = "chemd://desktop/current.chemd";
    const libraryUri = "chemd://desktop/library.chemd";
    const marked = withCursor(currentSource);
    const model = createModel(marked.source, documentUri);
    const compileOutput = compileChemdForEditor({
      source: marked.source,
      documentUri
    });
    const workspaceIndex = buildChemdWorkspaceSymbolIndex([
      {
        documentUri,
        source: marked.source,
        compileOutput
      },
      {
        documentUri: libraryUri,
        source: librarySource
      }
    ]);

    updateChemdCompletionOutput(documentUri, compileOutput);
    updateChemdCompletionWorkspaceIndex(documentUri, workspaceIndex);
    registerChemdCompletionProvider(monaco, "chemd");
    registerChemdCompletionProvider(monaco, "chemd");

    const suggestions = await getSuggestions(
      providers[0],
      model,
      marked.position,
      createContext(monaco)
    );
    const workspaceSuggestions = suggestions.filter((suggestion) =>
      suggestion.data?.type === "workspace-reference"
    );

    cleanupChemdCompletionWorkspaceIndex(documentUri, workspaceIndex);
    cleanupChemdCompletionOutput(documentUri, compileOutput);

    const cleanedSuggestions = await getSuggestions(
      providers[0],
      model,
      marked.position,
      createContext(monaco)
    );
    const localOnlySuggestions = await getSuggestions(
      providers[0],
      createModel("", "chemd://desktop/empty.chemd"),
      { lineNumber: 1, column: 1 } as Position,
      createContext(monaco)
    );

    expect(providers).toHaveLength(1);
    expect(suggestions.length).toBeGreaterThan(workspaceSuggestions.length);
    expect(workspaceSuggestions).toHaveLength(2);
    expect(workspaceSuggestions).toContainEqual(
      expect.objectContaining({
        kind: monaco.languages.CompletionItemKind.Reference,
        detail: expect.stringContaining(libraryUri),
        filterText: expect.stringContaining("mol-lib"),
        sortText: expect.stringMatching(/^wr-/),
        insertText: expect.stringContaining("mol-lib"),
        range: expect.objectContaining({
          startLineNumber: 8,
          startColumn: 12,
          endLineNumber: 8,
          endColumn: 13
        }),
        data: expect.objectContaining({
          type: "workspace-reference",
          localId: "mol-lib",
          documentUri: libraryUri,
          stale: false
        })
      })
    );
    expect(cleanedSuggestions.some((suggestion) =>
      suggestion.data?.type === "workspace-reference"
    )).toBe(false);
    expect(localOnlySuggestions.length).toBeGreaterThan(0);
    expect(localOnlySuggestions.some((suggestion) =>
      suggestion.data?.type === "workspace-reference"
    )).toBe(false);
  });
});
