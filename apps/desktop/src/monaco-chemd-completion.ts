import type { Monaco } from "@monaco-editor/react";
import type { editor, languages } from "monaco-editor";

import {
  getChemdCompletions,
  type ChemdCompletionItem,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";

type MonacoModel = editor.ITextModel;

const chemdCompletionOutputsByUri = new Map<string, ChemdLanguageCompileOutput>();
let chemdCompletionProviderDisposable: { dispose: () => void } | null = null;

export const updateChemdCompletionOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  chemdCompletionOutputsByUri.set(documentUri, compileOutput);
};

export const cleanupChemdCompletionOutput = (
  documentUri: string,
  compileOutput: ChemdLanguageCompileOutput
): void => {
  if (chemdCompletionOutputsByUri.get(documentUri) === compileOutput) {
    chemdCompletionOutputsByUri.delete(documentUri);
  }
};

export const registerChemdCompletionProvider = (
  monaco: Monaco,
  languageId: string
): void => {
  if (chemdCompletionProviderDisposable) {
    return;
  }

  const provider = createChemdCompletionProvider(monaco);
  chemdCompletionProviderDisposable = monaco.languages.registerCompletionItemProvider(
    languageId,
    provider
  );
};

const createChemdCompletionProvider = (
  monaco: Monaco
): languages.CompletionItemProvider => ({
  triggerCharacters: [":", " "],
  provideCompletionItems: (model, position, context) => {
    const documentUri = model.uri.toString();
    try {
      const completionList = getChemdCompletions({
        source: model.getValue(),
        documentUri,
        cursorOffset: model.getOffsetAt(position),
        position: {
          line: position.lineNumber,
          column: position.column
        },
        triggerKind: context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter
          ? "trigger-character"
          : "manual",
        triggerCharacter: context.triggerCharacter,
        compileOutput: getCompileOutputForModel(model)
      });

      return {
        suggestions: completionList.items.map((item) =>
          toMonacoCompletionItem(item, monaco)
        )
      };
    } catch {
      return { suggestions: [] };
    }
  }
});

const getCompileOutputForModel = (
  model: MonacoModel
): ChemdLanguageCompileOutput | undefined =>
  chemdCompletionOutputsByUri.get(model.uri.toString());

const toMonacoCompletionItem = (
  item: ChemdCompletionItem,
  monaco: Monaco
) => ({
  label: item.label,
  kind: toCompletionKind(item, monaco),
  detail: item.detail,
  documentation: item.documentation,
  insertText: item.insertText,
  insertTextRules: item.insertTextFormat === "snippet"
    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined,
  sortText: item.sortText,
  filterText: item.filterText,
  range: toCompletionRange(item, monaco)
});

const toCompletionKind = (item: ChemdCompletionItem, monaco: Monaco) => {
  if (item.kind === "snippet") {
    return monaco.languages.CompletionItemKind.Snippet;
  }
  if (item.kind === "field") {
    return monaco.languages.CompletionItemKind.Field;
  }

  return monaco.languages.CompletionItemKind.Value;
};

const toCompletionRange = (item: ChemdCompletionItem, monaco: Monaco) =>
  new monaco.Range(
    item.range.startLine,
    item.range.startColumn,
    item.range.endLine,
    item.range.endColumn
  );
