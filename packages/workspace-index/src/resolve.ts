import type {
  WorkspaceReference,
  WorkspaceReferenceStatus,
  WorkspaceSymbol
} from "./types";

const basename = (value: string): string => {
  const normalized = value.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
};

const trimKnownExtensions = (value: string): string =>
  value
    .replace(/\.chemd\.md$/i, "")
    .replace(/\.md$/i, "")
    .replace(/\.[^.]+$/i, "");

const documentAliases = (symbol: WorkspaceSymbol): Set<string> => {
  const aliases = new Set([symbol.documentUri, basename(symbol.documentUri)]);
  if (symbol.documentPath) {
    aliases.add(symbol.documentPath);
    aliases.add(basename(symbol.documentPath));
  }
  for (const alias of [...aliases]) {
    aliases.add(trimKnownExtensions(alias));
  }
  return aliases;
};

const statusForMatches = (matches: WorkspaceSymbol[]): WorkspaceReferenceStatus => {
  if (matches.length === 0) return "unresolved";
  return matches.length === 1 ? "resolved" : "ambiguous";
};

const findMatches = (
  reference: WorkspaceReference,
  symbols: readonly WorkspaceSymbol[]
): WorkspaceSymbol[] => {
  const localMatches = symbols.filter((symbol) =>
    symbol.localId === reference.targetLocalId
  );
  if (reference.targetDocumentAlias) {
    return localMatches.filter((symbol) =>
      documentAliases(symbol).has(reference.targetDocumentAlias ?? "")
    );
  }

  const sameDocumentMatches = localMatches.filter((symbol) =>
    symbol.documentUri === reference.documentUri
  );
  return sameDocumentMatches.length > 0 ? sameDocumentMatches : localMatches;
};

export const resolveReferences = (
  references: readonly WorkspaceReference[],
  symbols: readonly WorkspaceSymbol[]
): WorkspaceReference[] =>
  references.map((reference) => {
    const matches = findMatches(reference, symbols);
    return {
      ...reference,
      status: statusForMatches(matches),
      targetSymbolIds: matches.map((symbol) => symbol.symbolId).sort()
    };
  });
