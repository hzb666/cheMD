import { getChemdCompletionContext } from "./completion-context";
import { getChemdFieldCompletions } from "./completion-fields";
import { getChemdSnippetCompletions } from "./completion-snippets";
import type {
  ChemdCompletionContext,
  ChemdCompletionItem,
  ChemdCompletionList,
  ChemdCompletionRequest,
  ChemdWorkspaceSymbol
} from "./completion-types";
import { getChemdValueCompletions } from "./completion-values";

const referenceFields = new Set(["reaction", "prev", "reactants", "products", "inputs", "outputs", "product", "evidence", "ref"]);

const fieldKindPreferences: Record<string, string[]> = {
  reaction: ["reaction"],
  prev: ["reaction"],
  reactants: ["molecule", "artifact", "sample"],
  products: ["molecule", "artifact", "sample"],
  inputs: ["molecule", "artifact", "sample"],
  outputs: ["molecule", "artifact", "sample"],
  product: ["molecule", "artifact", "sample"],
  evidence: ["result", "analysis", "observation", "artifact"],
  ref: ["reaction", "molecule", "result", "analysis", "observation", "artifact"]
};

export const getChemdCompletions = (
  request: ChemdCompletionRequest
): ChemdCompletionList => {
  const context = getChemdCompletionContext(request);
  const items = [
    ...getChemdReferenceCompletions(context, request),
    ...getChemdTemplateCompletions(context, request),
    ...getChemdValueCompletions(context),
    ...getChemdFieldCompletions(context),
    ...getChemdSnippetCompletions(context)
  ];

  return {
    documentUri: request.documentUri,
    items: sortCompletionItems(items),
    range: context.range
  };
};

const getCurrentDocumentSymbols = (
  request: ChemdCompletionRequest
): ChemdWorkspaceSymbol[] => request.compileOutput?.symbols.map((symbol) => ({
  symbolId: `current#${symbol.id}`,
  documentUri: request.documentUri ?? request.compileOutput?.documentUri ?? "current",
  documentId: "current",
  localId: symbol.id,
  kind: symbol.kind,
  label: symbol.label,
  range: symbol.range,
  ...(symbol.sourceNodeType ? { summary: symbol.sourceNodeType } : {})
})) ?? [];

const getRequestSymbols = (
  request: ChemdCompletionRequest
): ChemdWorkspaceSymbol[] => [
  ...getCurrentDocumentSymbols(request),
  ...(request.workspaceIndex?.symbols ?? []),
  ...(request.externalSymbols ?? [])
];

const shouldSuggestReferences = (context: ChemdCompletionContext): boolean =>
  context.isReferencePosition
    || Boolean(context.fieldKey && referenceFields.has(context.fieldKey));

const filterPreferredSymbols = (
  symbols: ChemdWorkspaceSymbol[],
  context: ChemdCompletionContext
): ChemdWorkspaceSymbol[] => {
  const preferences = context.fieldKey ? fieldKindPreferences[context.fieldKey] ?? [] : [];
  const preferred = preferences.length > 0
    ? symbols.filter((symbol) => preferences.includes(symbol.kind))
    : [];

  return preferred.length > 0 ? preferred : symbols;
};

const getInsertText = (symbol: ChemdWorkspaceSymbol): string =>
  symbol.documentId === "current" ? `@${symbol.localId}` : `${symbol.documentId}#${symbol.localId}`;

const getReferenceSortText = (
  symbol: ChemdWorkspaceSymbol,
  context: ChemdCompletionContext
): string => {
  const preferences = context.fieldKey ? fieldKindPreferences[context.fieldKey] ?? [] : [];
  const kindIndex = preferences.indexOf(symbol.kind);
  const locality = symbol.documentId === "current" ? "0" : "1";
  const kindScore = kindIndex >= 0 ? String(kindIndex) : "8";
  const staleScore = symbol.stale ? "9" : "0";

  return `10${locality}${kindScore}${staleScore}-${symbol.label}`;
};

const createReferenceItem = (
  symbol: ChemdWorkspaceSymbol,
  context: ChemdCompletionContext
): ChemdCompletionItem => {
  const insertText = getInsertText(symbol);

  return {
    id: `reference.${symbol.symbolId}`,
    label: insertText,
    kind: symbol.kind === "template" ? "template" : "reference",
    insertText,
    insertTextFormat: "plain",
    detail: `${symbol.kind}${symbol.stale ? " (stale)" : ""}`,
    documentation: symbol.summary,
    sortText: getReferenceSortText(symbol, context),
    filterText: insertText,
    range: context.range,
    data: { symbol }
  };
};

const getChemdReferenceCompletions = (
  context: ChemdCompletionContext,
  request: ChemdCompletionRequest
): ChemdCompletionItem[] => {
  if (!shouldSuggestReferences(context)) {
    return [];
  }

  return filterPreferredSymbols(getRequestSymbols(request), context)
    .map((symbol) => createReferenceItem(symbol, context));
};

const getChemdTemplateCompletions = (
  context: ChemdCompletionContext,
  request: ChemdCompletionRequest
): ChemdCompletionItem[] => {
  if (!context.isUseHeaderPosition) {
    return [];
  }

  return getRequestSymbols(request)
    .filter((symbol) => symbol.kind === "template")
    .map((symbol) => createReferenceItem(symbol, context));
};

const sortCompletionItems = (items: ChemdCompletionItem[]): ChemdCompletionItem[] =>
  [...items].sort((left, right) =>
    (left.sortText ?? left.label).localeCompare(right.sortText ?? right.label)
  );
