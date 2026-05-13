import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";

import {
  getChemdCompletions,
  type ChemdCompletionItem,
  type ChemdLanguageCompileOutput,
  type ChemdWorkspaceSymbolIndex
} from "@chemd/language-service";

type MonacoDisposable = { dispose: () => void };

type CompletionProviderOptions = {
  getCompileOutput: () => ChemdLanguageCompileOutput | undefined;
  getWorkspaceIndex?: () => ChemdWorkspaceSymbolIndex | undefined;
};

const triggerCharacters = [":", "@", "#", "-", " "];

let activeRegistration: {
  id: symbol;
  disposable: MonacoDisposable;
} | null = null;

const toCompletionKind = (
  monaco: Monaco,
  item: ChemdCompletionItem
): languages.CompletionItemKind => {
  switch (item.kind) {
    case "snippet":
    case "template":
      return monaco.languages.CompletionItemKind.Snippet;
    case "field":
      return monaco.languages.CompletionItemKind.Field;
    case "value":
      return monaco.languages.CompletionItemKind.Value;
    case "reference":
      return monaco.languages.CompletionItemKind.Reference;
    case "quick_fix":
      return monaco.languages.CompletionItemKind.Event;
    default:
      return monaco.languages.CompletionItemKind.Text;
  }
};

const toMonacoRange = (
  monaco: Monaco,
  item: ChemdCompletionItem
): languages.CompletionItem["range"] =>
  new monaco.Range(
    item.range.startLine,
    item.range.startColumn,
    item.range.endLine,
    item.range.endColumn
  );

export const toMonacoCompletionItem = (
  monaco: Monaco,
  item: ChemdCompletionItem
): languages.CompletionItem => ({
  label: item.label,
  kind: toCompletionKind(monaco, item),
  insertText: item.insertText,
  insertTextRules: item.insertTextFormat === "snippet"
    ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
    : undefined,
  detail: item.detail,
  documentation: item.documentation,
  sortText: item.sortText,
  filterText: item.filterText,
  range: toMonacoRange(monaco, item)
});

const getTriggerKind = (
  context: languages.CompletionContext
): "manual" | "trigger-character" | "typing" => {
  if (context.triggerKind === 1) {
    return "trigger-character";
  }
  if (context.triggerKind === 0) {
    return "manual";
  }
  return "typing";
};

const provideCompletionItems = (
  monaco: Monaco,
  model: editor.ITextModel,
  position: Position,
  context: languages.CompletionContext,
  options: CompletionProviderOptions
): languages.ProviderResult<languages.CompletionList> => {
  const completions = getChemdCompletions({
    source: model.getValue(),
    documentUri: model.uri.toString(),
    cursorOffset: model.getOffsetAt(position),
    position: {
      line: position.lineNumber,
      column: position.column
    },
    triggerKind: getTriggerKind(context),
    triggerCharacter: context.triggerCharacter,
    compileOutput: options.getCompileOutput(),
    workspaceIndex: options.getWorkspaceIndex?.()
  });

  return {
    suggestions: completions.items.map((item) => toMonacoCompletionItem(monaco, item))
  };
};

export const registerChemdCompletionProvider = (
  monaco: Monaco,
  languageId: string,
  options: CompletionProviderOptions
): MonacoDisposable => {
  activeRegistration?.disposable.dispose();

  const id = Symbol(languageId);
  const disposable = monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters,
    provideCompletionItems: (
      model: editor.ITextModel,
      position: Position,
      context: languages.CompletionContext
    ) =>
      provideCompletionItems(monaco, model, position, context, options)
  });
  activeRegistration = { id, disposable };

  return {
    dispose: () => {
      if (activeRegistration?.id !== id) {
        return;
      }
      activeRegistration.disposable.dispose();
      activeRegistration = null;
    }
  };
};
