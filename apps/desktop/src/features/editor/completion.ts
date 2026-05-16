import type { Monaco } from "@monaco-editor/react";
import type { editor, languages, Position } from "monaco-editor";

import {
  getChemdCompletions,
  getChemdWorkspaceReferenceCompletions,
  type ChemdCompletionItem,
  type ChemdCompletionRequest,
  type ChemdLanguageCompileOutput,
  type ChemdSourceRange,
  type ChemdWorkspaceReferenceCompletionItem,
  type ChemdWorkspaceSymbolIndex
} from "@chemd/language-service";

type MonacoModel = editor.ITextModel;
type MonacoDisposable = { dispose: () => void };
type ChemdMonacoCompletionItem = languages.CompletionItem & {
  data?: unknown;
};

const chemdCompletionOutputsByUri = new Map<string, ChemdLanguageCompileOutput>();
const chemdCompletionWorkspaceIndexesByUri = new Map<string, ChemdWorkspaceSymbolIndex>();
let chemdCompletionGlobalWorkspaceIndex: ChemdWorkspaceSymbolIndex | undefined;
let chemdCompletionProviderDisposable: MonacoDisposable | null = null;

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

export const updateChemdCompletionWorkspaceIndex = (
  documentUri: string | undefined,
  workspaceSymbolIndex: ChemdWorkspaceSymbolIndex
): void => {
  if (documentUri) {
    chemdCompletionWorkspaceIndexesByUri.set(documentUri, workspaceSymbolIndex);
    return;
  }

  chemdCompletionGlobalWorkspaceIndex = workspaceSymbolIndex;
};

export const cleanupChemdCompletionWorkspaceIndex = (
  documentUri?: string,
  workspaceSymbolIndex?: ChemdWorkspaceSymbolIndex
): void => {
  if (documentUri) {
    if (
      !workspaceSymbolIndex ||
      chemdCompletionWorkspaceIndexesByUri.get(documentUri) === workspaceSymbolIndex
    ) {
      chemdCompletionWorkspaceIndexesByUri.delete(documentUri);
    }
    return;
  }

  if (!workspaceSymbolIndex || chemdCompletionGlobalWorkspaceIndex === workspaceSymbolIndex) {
    chemdCompletionGlobalWorkspaceIndex = undefined;
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
  triggerCharacters: [":", " ", "@"],
  provideCompletionItems: (model, position, context) => {
    const request = createCompletionRequest(monaco, model, position, context);
    const localItems = getLocalCompletionItems(request, monaco);
    const workspaceItems = getWorkspaceCompletionItems(request, monaco);

    return {
      suggestions: [...localItems, ...workspaceItems]
    };
  }
});

const createCompletionRequest = (
  monaco: Monaco,
  model: MonacoModel,
  position: Position,
  context: languages.CompletionContext
): ChemdCompletionRequest => ({
  source: model.getValue(),
  documentUri: model.uri.toString(),
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

const getLocalCompletionItems = (
  request: ChemdCompletionRequest,
  monaco: Monaco
): ChemdMonacoCompletionItem[] => {
  try {
    return getChemdCompletions(request).items.map((item) =>
      toMonacoCompletionItem(item, monaco)
    );
  } catch {
    return [];
  }
};

const getWorkspaceCompletionItems = (
  request: ChemdCompletionRequest,
  monaco: Monaco
): ChemdMonacoCompletionItem[] => {
  try {
    const workspaceSymbolIndex = getWorkspaceIndexForDocument(request.documentUri);
    if (!workspaceSymbolIndex) {
      return [];
    }

    return getChemdWorkspaceReferenceCompletions({
      ...request,
      currentDocumentId: getCurrentDocumentId(workspaceSymbolIndex, request.documentUri),
      workspaceSymbolIndex
    }).items.map((item) =>
      toMonacoWorkspaceReferenceCompletionItem(item, monaco)
    );
  } catch {
    return [];
  }
};

const getCompileOutputForModel = (
  model: MonacoModel
): ChemdLanguageCompileOutput | undefined =>
  chemdCompletionOutputsByUri.get(model.uri.toString());

const getWorkspaceIndexForDocument = (
  documentUri: string | undefined
): ChemdWorkspaceSymbolIndex | undefined =>
  documentUri
    ? chemdCompletionWorkspaceIndexesByUri.get(documentUri) ?? chemdCompletionGlobalWorkspaceIndex
    : chemdCompletionGlobalWorkspaceIndex;

const getCurrentDocumentId = (
  workspaceSymbolIndex: ChemdWorkspaceSymbolIndex,
  documentUri: string | undefined
): string | undefined =>
  documentUri
    ? workspaceSymbolIndex.documents.find((document) =>
      document.documentUri === documentUri
    )?.documentId
    : undefined;

const toMonacoCompletionItem = (
  item: ChemdCompletionItem,
  monaco: Monaco
): ChemdMonacoCompletionItem => ({
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
  range: toCompletionRange(item.range, monaco),
  data: item.data
});

const toMonacoWorkspaceReferenceCompletionItem = (
  item: ChemdWorkspaceReferenceCompletionItem,
  monaco: Monaco
): ChemdMonacoCompletionItem => ({
  label: item.label,
  kind: monaco.languages.CompletionItemKind.Reference,
  detail: item.detail,
  insertText: item.insertText,
  sortText: item.sortText,
  filterText: item.filterText,
  range: toCompletionRange(item.range, monaco),
  data: item.data
});

const toCompletionKind = (item: ChemdCompletionItem, monaco: Monaco) => {
  if (item.kind === "snippet") {
    return monaco.languages.CompletionItemKind.Snippet;
  }
  if (item.kind === "field") {
    return monaco.languages.CompletionItemKind.Field;
  }
  if (item.kind === "reference") {
    return monaco.languages.CompletionItemKind.Reference;
  }

  return monaco.languages.CompletionItemKind.Value;
};

const toCompletionRange = (range: ChemdSourceRange, monaco: Monaco) =>
  new monaco.Range(
    range.startLine,
    range.startColumn,
    range.endLine,
    range.endColumn
  );
