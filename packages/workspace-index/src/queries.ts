import type {
  WorkspaceIndexSummary,
  WorkspaceReference,
  WorkspaceSymbol,
  WorkspaceSymbolIndex
} from "./types";

export interface WorkspaceSymbolQuery {
  query?: string;
  kind?: string;
  documentUri?: string;
}

export interface WorkspaceSymbolTarget {
  symbolId?: string;
  documentUri?: string;
  localId?: string;
  label?: string;
}

const symbolMatchesTarget = (
  symbol: WorkspaceSymbol,
  target: WorkspaceSymbolTarget
): boolean => {
  if (target.symbolId) return symbol.symbolId === target.symbolId;
  if (target.documentUri && symbol.documentUri !== target.documentUri) return false;
  if (target.localId && symbol.localId !== target.localId) return false;
  if (target.label && symbol.label !== target.label) return false;
  return Boolean(target.documentUri || target.localId || target.label);
};

const sortSymbols = (symbols: readonly WorkspaceSymbol[]): WorkspaceSymbol[] =>
  [...symbols].sort((left, right) =>
    left.label.localeCompare(right.label)
    || left.documentUri.localeCompare(right.documentUri)
    || left.localId.localeCompare(right.localId)
    || left.symbolId.localeCompare(right.symbolId)
  );

export const findSymbolDefinitions = (
  index: WorkspaceSymbolIndex,
  target: WorkspaceSymbolTarget
): WorkspaceSymbol[] =>
  sortSymbols(index.symbols.filter((symbol) => symbolMatchesTarget(symbol, target)));

export const findReferences = (
  index: WorkspaceSymbolIndex,
  target: WorkspaceSymbolTarget
): WorkspaceReference[] => {
  const symbolIds = new Set(findSymbolDefinitions(index, target).map((symbol) => symbol.symbolId));
  return index.references.filter((reference) =>
    reference.targetSymbolIds.some((symbolId) => symbolIds.has(symbolId))
  );
};

export const listWorkspaceSymbols = (
  index: WorkspaceSymbolIndex,
  query: WorkspaceSymbolQuery = {}
): WorkspaceSymbol[] => {
  const queryText = query.query?.toLowerCase();
  return sortSymbols(index.symbols.filter((symbol) => {
    if (query.kind && symbol.kind !== query.kind) return false;
    if (query.documentUri && symbol.documentUri !== query.documentUri) return false;
    if (!queryText) return true;
    return symbol.label.toLowerCase().includes(queryText)
      || symbol.localId.toLowerCase().includes(queryText);
  }));
};

export const summarizeWorkspaceIndex = (
  index: WorkspaceSymbolIndex
): WorkspaceIndexSummary => ({
  documentCount: index.documents.length,
  failedDocumentCount: index.documents.filter((document) => document.status === "failed").length,
  symbolCount: index.symbols.length,
  referenceCount: index.references.length,
  resolvedReferenceCount: index.references.filter((reference) =>
    reference.status === "resolved"
  ).length,
  unresolvedReferenceCount: index.references.filter((reference) =>
    reference.status === "unresolved"
  ).length,
  ambiguousReferenceCount: index.references.filter((reference) =>
    reference.status === "ambiguous"
  ).length,
  diagnosticCount: index.diagnostics.length
});
