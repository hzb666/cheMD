import {
  compileChemdForEditor,
  type ChemdLanguageServiceDependencies
} from "./compile";
import { createSourceHash } from "./ranges";
import type { ChemdEditorDiagnostic, ChemdSymbol } from "./types";
import type {
  ChemdWorkspaceDiagnosticsSummary,
  ChemdWorkspaceSymbol,
  ChemdWorkspaceSymbolDocument,
  ChemdWorkspaceSymbolDocumentEntry,
  ChemdWorkspaceSymbolIndex
} from "./workspace-symbol-types";

const sanitizeDocumentIdPart = (value: string): string => {
  const trimmed = value.trim();
  const normalized = trimmed.replaceAll("\\", "/");
  const tail = normalized.split("/").filter(Boolean).at(-1) ?? trimmed;
  const slug = Array.from(tail)
    .map((char) => (
      (char >= "A" && char <= "Z")
      || (char >= "a" && char <= "z")
      || (char >= "0" && char <= "9")
      || char === "."
      || char === "_"
      || char === "-"
        ? char
        : "-"
    ))
    .join("")
    .split("-")
    .filter(Boolean)
    .join("-");
  return slug || "document";
};

const createDocumentId = (documentUri: string): string =>
  `${sanitizeDocumentIdPart(documentUri)}-${createSourceHash(documentUri)}`;

const buildCompileOutput = (
  entry: ChemdWorkspaceSymbolDocumentEntry,
  dependencies: ChemdLanguageServiceDependencies
) => entry.compileOutput ?? compileChemdForEditor({
  source: entry.source,
  documentUri: entry.documentUri,
  options: entry.options
}, dependencies);

const createWorkspaceSymbol = (
  symbol: ChemdSymbol,
  document: Pick<ChemdWorkspaceSymbolDocument, "documentId" | "documentUri" | "sourceHash" | "stale">
): ChemdWorkspaceSymbol => ({
  id: `${document.documentId}#${symbol.id}`,
  localId: symbol.id,
  name: symbol.label,
  kind: symbol.kind,
  documentId: document.documentId,
  documentUri: document.documentUri,
  range: symbol.range,
  sourceHash: document.sourceHash,
  sourceNodeType: symbol.sourceNodeType,
  summary: `${symbol.kind} ${symbol.label}`,
  stale: document.stale
});

const compareSymbols = (
  left: ChemdWorkspaceSymbol,
  right: ChemdWorkspaceSymbol
): number =>
  left.name.localeCompare(right.name)
  || left.kind.localeCompare(right.kind)
  || left.documentUri.localeCompare(right.documentUri)
  || left.localId.localeCompare(right.localId)
  || left.range.startLine - right.range.startLine
  || left.range.startColumn - right.range.startColumn;

const addByKind = (
  target: Record<string, ChemdWorkspaceSymbol[]>,
  symbol: ChemdWorkspaceSymbol
): void => {
  target[symbol.kind] = [...(target[symbol.kind] ?? []), symbol];
};

const addByName = (
  target: Record<string, string[]>,
  symbol: ChemdWorkspaceSymbol
): void => {
  target[symbol.name] = [...(target[symbol.name] ?? []), symbol.id];
};

const summarizeDiagnostics = (
  documents: readonly ChemdWorkspaceSymbolDocument[]
): ChemdWorkspaceDiagnosticsSummary => {
  const diagnostics = documents.flatMap((document) => document.diagnostics);
  return {
    totalDocuments: documents.length,
    okDocuments: documents.filter((document) => document.status === "ok").length,
    failedDocuments: documents.filter((document) => document.status === "failed").length,
    totalDiagnostics: diagnostics.length,
    errors: countDiagnostics(diagnostics, "error"),
    warnings: countDiagnostics(diagnostics, "warning"),
    infos: countDiagnostics(diagnostics, "info")
  };
};

const countDiagnostics = (
  diagnostics: readonly ChemdEditorDiagnostic[],
  severity: ChemdEditorDiagnostic["severity"]
): number => diagnostics.filter((diagnostic) => diagnostic.severity === severity).length;

export const buildChemdWorkspaceSymbolIndex = (
  entries: readonly ChemdWorkspaceSymbolDocumentEntry[],
  dependencies: ChemdLanguageServiceDependencies = {}
): ChemdWorkspaceSymbolIndex => {
  const documents: ChemdWorkspaceSymbolDocument[] = [];
  const symbols: ChemdWorkspaceSymbol[] = [];

  for (const entry of entries) {
    const output = buildCompileOutput(entry, dependencies);
    const documentId = createDocumentId(entry.documentUri);
    const sourceHash = createSourceHash(entry.source);
    const documentBase = {
      documentId,
      documentUri: entry.documentUri,
      sourceHash,
      stale: entry.stale ?? false
    };
    const documentSymbols = output.status === "ok"
      ? output.symbols.map((symbol) => createWorkspaceSymbol(symbol, documentBase))
      : [];
    documents.push({
      ...documentBase,
      status: output.status,
      compiledAt: output.compiledAt,
      symbolCount: documentSymbols.length,
      diagnostics: output.diagnostics
    });
    symbols.push(...documentSymbols);
  }

  const sortedSymbols = [...symbols].sort(compareSymbols);
  return {
    documents,
    symbols: sortedSymbols,
    symbolsByKind: buildSymbolsByKind(sortedSymbols),
    symbolIdsByName: buildSymbolIdsByName(sortedSymbols),
    diagnosticsSummary: summarizeDiagnostics(documents)
  };
};

const buildSymbolsByKind = (
  symbols: readonly ChemdWorkspaceSymbol[]
): Record<string, ChemdWorkspaceSymbol[]> => {
  const result: Record<string, ChemdWorkspaceSymbol[]> = {};
  symbols.forEach((symbol) => addByKind(result, symbol));
  return result;
};

const buildSymbolIdsByName = (
  symbols: readonly ChemdWorkspaceSymbol[]
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  symbols.forEach((symbol) => addByName(result, symbol));
  return result;
};

export const findChemdWorkspaceSymbolById = (
  index: ChemdWorkspaceSymbolIndex,
  symbolId: string
): ChemdWorkspaceSymbol | undefined =>
  index.symbols.find((symbol) => symbol.id === symbolId);

export const findChemdWorkspaceSymbolsByName = (
  index: ChemdWorkspaceSymbolIndex,
  name: string
): ChemdWorkspaceSymbol[] => {
  const ids = index.symbolIdsByName[name] ?? [];
  return ids.flatMap((id) => {
    const symbol = findChemdWorkspaceSymbolById(index, id);
    return symbol ? [symbol] : [];
  });
};

export const findChemdWorkspaceSymbolsByKind = (
  index: ChemdWorkspaceSymbolIndex,
  kind: string
): ChemdWorkspaceSymbol[] => index.symbolsByKind[kind] ?? [];
