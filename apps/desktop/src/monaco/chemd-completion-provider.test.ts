import { describe, expect, it } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { ChemdCompletionItem } from "@chemd/language-service";

import {
  registerChemdCompletionProvider,
  toMonacoCompletionItem
} from "./chemd-completion-provider";

const range = {
  startLine: 3,
  startColumn: 5,
  endLine: 3,
  endColumn: 8
};

const fakeMonaco = (): Monaco => ({
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
  languages: {
    CompletionItemKind: {
      Snippet: 27,
      Field: 4,
      Value: 12,
      Reference: 18,
      Event: 23,
      Text: 1
    },
    CompletionItemInsertTextRule: {
      InsertAsSnippet: 4
    },
    registerCompletionItemProvider: () => ({ dispose: () => undefined })
  }
} as unknown as Monaco);

const item = (
  overrides: Partial<ChemdCompletionItem> = {}
): ChemdCompletionItem => ({
  id: "completion-1",
  label: "chemd reaction",
  kind: "snippet",
  insertText: ":::chemd #${1:id}",
  insertTextFormat: "snippet",
  range,
  ...overrides
});

describe("chemd Monaco completion provider", () => {
  it("maps snippets to Monaco snippet insert rules", () => {
    const monacoItem = toMonacoCompletionItem(fakeMonaco(), item());

    expect(monacoItem).toMatchObject({
      label: "chemd reaction",
      kind: 27,
      insertText: ":::chemd #${1:id}",
      insertTextRules: 4
    });
    expect(monacoItem.range).toMatchObject({
      startLineNumber: 3,
      startColumn: 5,
      endLineNumber: 3,
      endColumn: 8
    });
  });

  it("maps field, value, and reference kinds without snippet rules", () => {
    const monaco = fakeMonaco();

    expect(toMonacoCompletionItem(monaco, item({
      kind: "field",
      label: "reactants:",
      insertText: "reactants: ",
      insertTextFormat: "plain"
    }))).toMatchObject({ kind: 4, insertTextRules: undefined });
    expect(toMonacoCompletionItem(monaco, item({
      kind: "value",
      label: "reaction",
      insertText: "reaction",
      insertTextFormat: "plain"
    }))).toMatchObject({ kind: 12, insertTextRules: undefined });
    expect(toMonacoCompletionItem(monaco, item({
      kind: "reference",
      label: "@mol-a",
      insertText: "@mol-a",
      insertTextFormat: "plain"
    }))).toMatchObject({ kind: 18, insertTextRules: undefined });
  });

  it("disposes the previous provider before registering a new one", () => {
    const disposals: string[] = [];
    const registrations: unknown[] = [];
    const monaco = {
      ...fakeMonaco(),
      languages: {
        ...fakeMonaco().languages,
        registerCompletionItemProvider: (_languageId: string, provider: unknown) => {
          registrations.push(provider);
          return { dispose: () => disposals.push(`provider-${registrations.length}`) };
        }
      }
    } as Monaco;

    const first = registerChemdCompletionProvider(monaco, "chemd", {
      getCompileOutput: () => undefined
    });
    const second = registerChemdCompletionProvider(monaco, "chemd", {
      getCompileOutput: () => undefined
    });

    expect(registrations).toHaveLength(2);
    expect(disposals).toEqual(["provider-1"]);
    first.dispose();
    expect(disposals).toEqual(["provider-1"]);
    second.dispose();
    expect(disposals).toEqual(["provider-1", "provider-2"]);
  });
});

