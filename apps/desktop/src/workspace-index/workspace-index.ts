import type {
  ChemdWorkspaceSymbol,
  ChemdWorkspaceSymbolIndex
} from "@chemd/language-service";
import {
  buildWorkspaceSymbolIndex,
  findReferences,
  listWorkspaceSymbols,
  summarizeWorkspaceIndex,
  type WorkspaceDocumentInput,
  type WorkspaceIndexCompileFn,
  type WorkspaceReference,
  type WorkspaceSymbol,
  type WorkspaceSymbolIndex
} from "@chemd/workspace-index";

import type { WorkspaceFileEntry } from "../contracts";
import {
  buildWorkspaceRagView,
  type WorkspaceRagGate,
  type WorkspaceRagResult
} from "./rag-citation-gate";

export type WorkspaceIndexState = "empty" | "ready" | "degraded" | "failed";

export interface WorkspaceDocumentSource {
  path: string;
  source: string;
  modifiedAtMs?: number | null;
}

export interface WorkspaceIndexInput {
  workspaceId: string;
  files: readonly WorkspaceFileEntry[];
  currentDocument?: WorkspaceDocumentSource;
  documents?: readonly WorkspaceDocumentSource[];
  compile?: WorkspaceIndexCompileFn;
}

export interface WorkspaceSymbolRow {
  id: string;
  label: string;
  kind: string;
  documentPath: string;
  line: number;
  duplicate: boolean;
}

export interface WorkspaceReferenceRow {
  id: string;
  sourcePath: string;
  field: string;
  target: string;
  status: WorkspaceReference["status"];
  line: number;
  targetCount: number;
}

export interface WorkspaceIndexViewModel {
  state: WorkspaceIndexState;
  message: string;
  index: WorkspaceSymbolIndex | null;
  completionIndex: ChemdWorkspaceSymbolIndex | undefined;
  symbols: WorkspaceSymbolRow[];
  references: WorkspaceReferenceRow[];
  ragResults: WorkspaceRagResult[];
  ragGate: WorkspaceRagGate;
  badges: Array<{ label: string; value: string; tone: "neutral" | "ready" | "warning" | "error" }>;
}

export const isChemdDocumentPath = (path: string): boolean =>
  path.endsWith(".chemd") || path.endsWith(".chemd.md");

const pathToUri = (workspaceId: string, path: string): string =>
  `chemd-workspace://${encodeURIComponent(workspaceId)}/${path.replace(/\\/g, "/").replace(/^\/+/, "")}`;

const documentIdFromPath = (path: string): string =>
  path
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.chemd(?:\.md)?$/u, "")
    || "document";

const buildDocuments = (
  input: WorkspaceIndexInput
): WorkspaceDocumentInput[] => {
  const visibleChemdPaths = new Set(input.files
    .filter((file) => file.kind === "file" && isChemdDocumentPath(file.path))
    .map((file) => file.path));
  const byPath = new Map<string, WorkspaceDocumentSource>();

  for (const document of input.documents ?? []) {
    if (visibleChemdPaths.has(document.path) || isChemdDocumentPath(document.path)) {
      byPath.set(document.path, document);
    }
  }

  if (input.currentDocument && isChemdDocumentPath(input.currentDocument.path)) {
    byPath.set(input.currentDocument.path, input.currentDocument);
  }

  return [...byPath.values()].map((document) => ({
    uri: pathToUri(input.workspaceId, document.path),
    path: document.path,
    source: document.source,
    metadata: {
      workspaceId: input.workspaceId,
      modifiedAtMs: document.modifiedAtMs ?? null
    }
  }));
};

const buildState = (
  index: WorkspaceSymbolIndex | null,
  candidateDocumentCount: number
): WorkspaceIndexState => {
  if (!index || candidateDocumentCount === 0) {
    return "empty";
  }
  const summary = summarizeWorkspaceIndex(index);
  if (summary.failedDocumentCount === summary.documentCount && summary.documentCount > 0) {
    return "failed";
  }
  if (
    summary.failedDocumentCount > 0
    || summary.unresolvedReferenceCount > 0
    || summary.ambiguousReferenceCount > 0
    || index.diagnostics.some((item) => item.diagnostic.severity === "error")
  ) {
    return "degraded";
  }
  return "ready";
};

const messageForState = (
  state: WorkspaceIndexState,
  summary: ReturnType<typeof summarizeWorkspaceIndex> | null
): string => {
  if (!summary || state === "empty") {
    return "No loaded Chemd workspace documents are available for symbol indexing.";
  }
  if (state === "failed") {
    return "All loaded workspace documents failed to compile; references are shown as unresolved.";
  }
  if (state === "degraded") {
    return "Workspace index is available with unresolved references or diagnostics.";
  }
  return "Workspace symbols and cross-document references are indexed.";
};

const toSymbolRow = (symbol: WorkspaceSymbol): WorkspaceSymbolRow => ({
  id: symbol.symbolId,
  label: symbol.label,
  kind: symbol.kind,
  documentPath: symbol.documentPath ?? symbol.documentUri,
  line: symbol.range.startLine,
  duplicate: symbol.duplicateLocalId
});

const toReferenceRow = (reference: WorkspaceReference): WorkspaceReferenceRow => ({
  id: reference.referenceId,
  sourcePath: reference.documentPath ?? reference.documentUri,
  field: reference.field,
  target: reference.targetText,
  status: reference.status,
  line: reference.range.startLine,
  targetCount: reference.targetSymbolIds.length
});

const toCompletionSymbol = (symbol: WorkspaceSymbol): ChemdWorkspaceSymbol => ({
  id: symbol.symbolId,
  documentUri: symbol.documentUri,
  documentId: documentIdFromPath(symbol.documentPath ?? symbol.documentUri),
  localId: symbol.localId,
  kind: symbol.kind,
  name: symbol.label,
  range: symbol.range,
  sourceHash: symbol.sourceHash,
  stale: Boolean(symbol.stale || symbol.duplicateLocalId),
  summary: symbol.documentPath ?? symbol.documentUri
});

const addCompletionSymbolByKind = (
  target: Record<string, ChemdWorkspaceSymbol[]>,
  symbol: ChemdWorkspaceSymbol
): void => {
  target[symbol.kind] = [...(target[symbol.kind] ?? []), symbol];
};

const addCompletionSymbolByName = (
  target: Record<string, string[]>,
  symbol: ChemdWorkspaceSymbol
): void => {
  target[symbol.name] = [...(target[symbol.name] ?? []), symbol.id];
};

const toCompletionIndex = (
  index: WorkspaceSymbolIndex
): ChemdWorkspaceSymbolIndex => {
  const symbols = index.symbols.map(toCompletionSymbol);
  const symbolsByKind: Record<string, ChemdWorkspaceSymbol[]> = {};
  const symbolIdsByName: Record<string, string[]> = {};
  symbols.forEach((symbol) => {
    addCompletionSymbolByKind(symbolsByKind, symbol);
    addCompletionSymbolByName(symbolIdsByName, symbol);
  });

  return {
    documents: index.documents.map((document) => ({
      documentId: documentIdFromPath(document.path ?? document.uri),
      documentUri: document.uri,
      sourceHash: document.sourceHash,
      status: document.status,
      compiledAt: index.generatedAt,
      stale: false,
      symbolCount: symbols.filter((symbol) => symbol.documentUri === document.uri).length,
      diagnostics: index.diagnostics
        .filter((item) => item.documentUri === document.uri)
        .map((item) => item.diagnostic)
    })),
    symbols,
    symbolsByKind,
    symbolIdsByName,
    diagnosticsSummary: {
      totalDocuments: index.documents.length,
      okDocuments: index.documents.filter((document) => document.status === "ok").length,
      failedDocuments: index.documents.filter((document) => document.status === "failed").length,
      totalDiagnostics: index.diagnostics.length,
      errors: index.diagnostics.filter((item) => item.diagnostic.severity === "error").length,
      warnings: index.diagnostics.filter((item) => item.diagnostic.severity === "warning").length,
      infos: index.diagnostics.filter((item) => item.diagnostic.severity === "info").length
    }
  };
};

const badgeTone = (
  value: number,
  warningThreshold = 1
): "neutral" | "ready" | "warning" =>
  value >= warningThreshold ? "warning" : "ready";

export const buildWorkspaceIndexViewModel = (
  input: WorkspaceIndexInput
): WorkspaceIndexViewModel => {
  const documents = buildDocuments(input);
  const index = documents.length > 0
    ? buildWorkspaceSymbolIndex(documents, input.compile)
    : null;
  const summary = index ? summarizeWorkspaceIndex(index) : null;
  const state = buildState(index, documents.length);
  const ragView = buildWorkspaceRagView(input.workspaceId, documents);

  return {
    state,
    message: messageForState(state, summary),
    index,
    completionIndex: index ? toCompletionIndex(index) : undefined,
    symbols: index ? listWorkspaceSymbols(index).map(toSymbolRow) : [],
    references: index ? index.references.map(toReferenceRow) : [],
    ragResults: ragView.ragResults,
    ragGate: ragView.ragGate,
    badges: summary ? [
      { label: "Docs", value: String(summary.documentCount), tone: "neutral" },
      { label: "Symbols", value: String(summary.symbolCount), tone: "ready" },
      { label: "Refs", value: String(summary.referenceCount), tone: "neutral" },
      { label: "RAG", value: String(ragView.ragResults.length), tone: ragView.ragGate.state === "ready" ? "ready" : "warning" },
      { label: "Unresolved", value: String(summary.unresolvedReferenceCount), tone: badgeTone(summary.unresolvedReferenceCount) },
      { label: "Failed", value: String(summary.failedDocumentCount), tone: summary.failedDocumentCount > 0 ? "error" : "ready" }
    ] : [
      { label: "Docs", value: "0", tone: "neutral" },
      { label: "RAG", value: "0", tone: "warning" }
    ]
  };
};

export const getWorkspaceReferenceRowsForSymbol = (
  index: WorkspaceSymbolIndex,
  symbol: WorkspaceSymbol
): WorkspaceReferenceRow[] =>
  findReferences(index, { symbolId: symbol.symbolId }).map(toReferenceRow);
