import {
  compileChemdForEditor,
  type ChemdLanguageCompileOutput
} from "@chemd/language-service";
import { createCompileFailureDiagnostic, createReferenceDiagnostics } from "./diagnostics";
import { hashSource } from "./hash";
import { extractReferenceCandidates } from "./references";
import { resolveReferences } from "./resolve";
import type {
  WorkspaceDocumentInput,
  WorkspaceIndexCompileFn,
  WorkspaceIndexDiagnostic,
  WorkspaceIndexedDocument,
  WorkspaceSymbol,
  WorkspaceSymbolIndex
} from "./types";

const VERSION = "chemd-workspace-symbol-index/v0.1" as const;

const defaultCompile: WorkspaceIndexCompileFn = (input) =>
  compileChemdForEditor({
    source: input.source,
    documentUri: input.documentUri
  });

const sortDocuments = (
  documents: readonly WorkspaceDocumentInput[]
): WorkspaceDocumentInput[] =>
  [...documents].sort((left, right) =>
    left.uri.localeCompare(right.uri) || (left.path ?? "").localeCompare(right.path ?? "")
  );

const readCompileOutput = (
  document: WorkspaceDocumentInput,
  compile: WorkspaceIndexCompileFn
): ChemdLanguageCompileOutput | WorkspaceIndexDiagnostic => {
  try {
    return compile({ source: document.source, documentUri: document.uri });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createCompileFailureDiagnostic(document.uri, message);
  }
};

const buildIndexedDocument = (
  document: WorkspaceDocumentInput,
  output: ChemdLanguageCompileOutput | WorkspaceIndexDiagnostic,
  sourceHash: string
): WorkspaceIndexedDocument => ({
  uri: document.uri,
  path: document.path,
  metadata: document.metadata,
  sourceHash,
  status: "diagnostic" in output || output.status === "failed" ? "failed" : "ok"
});

const appendDuplicateSuffix = (
  baseId: string,
  counts: Map<string, number>
): string => {
  const nextCount = (counts.get(baseId) ?? 0) + 1;
  counts.set(baseId, nextCount);
  return nextCount === 1 ? baseId : `${baseId}~${nextCount}`;
};

const buildSymbols = (
  document: WorkspaceDocumentInput,
  output: ChemdLanguageCompileOutput,
  sourceHash: string,
  symbolIdCounts: Map<string, number>
): WorkspaceSymbol[] => {
  if (output.status === "failed") return [];
  return output.symbols.map((symbol) => {
    const baseSymbolId = `${document.uri}#${symbol.id}`;
    return {
      symbolId: appendDuplicateSuffix(baseSymbolId, symbolIdCounts),
      documentUri: document.uri,
      documentPath: document.path,
      localId: symbol.id,
      label: symbol.label,
      kind: symbol.kind,
      range: symbol.range,
      sourceHash,
      duplicateLocalId: false
    };
  });
};

const markDuplicates = (symbols: readonly WorkspaceSymbol[]): WorkspaceSymbol[] => {
  const localCounts = new Map<string, number>();
  for (const symbol of symbols) {
    const key = `${symbol.documentUri}#${symbol.localId}`;
    localCounts.set(key, (localCounts.get(key) ?? 0) + 1);
  }
  return symbols.map((symbol) => ({
    ...symbol,
    duplicateLocalId: (localCounts.get(`${symbol.documentUri}#${symbol.localId}`) ?? 0) > 1
  }));
};

const sortSymbols = (symbols: readonly WorkspaceSymbol[]): WorkspaceSymbol[] =>
  [...symbols].sort((left, right) =>
    left.documentUri.localeCompare(right.documentUri)
    || left.localId.localeCompare(right.localId)
    || left.kind.localeCompare(right.kind)
    || left.symbolId.localeCompare(right.symbolId)
  );

const sortDiagnostics = (
  diagnostics: readonly WorkspaceIndexDiagnostic[]
): WorkspaceIndexDiagnostic[] =>
  [...diagnostics].sort((left, right) =>
    left.documentUri.localeCompare(right.documentUri)
    || left.diagnostic.range.startLine - right.diagnostic.range.startLine
    || left.diagnostic.range.startColumn - right.diagnostic.range.startColumn
    || left.diagnostic.code.localeCompare(right.diagnostic.code)
  );

export const buildWorkspaceSymbolIndex = (
  documents: readonly WorkspaceDocumentInput[],
  compile: WorkspaceIndexCompileFn = defaultCompile
): WorkspaceSymbolIndex => {
  const symbolIdCounts = new Map<string, number>();
  const indexedDocuments: WorkspaceIndexedDocument[] = [];
  const symbols: WorkspaceSymbol[] = [];
  const diagnostics: WorkspaceIndexDiagnostic[] = [];
  const references = sortDocuments(documents).flatMap((document) => {
    const sourceHash = hashSource(document.source);
    const output = readCompileOutput(document, compile);
    indexedDocuments.push(buildIndexedDocument(document, output, sourceHash));
    if ("diagnostic" in output) {
      diagnostics.push(output);
      return extractReferenceCandidates(document);
    }
    diagnostics.push(...output.diagnostics.map((diagnostic) => ({
      documentUri: document.uri,
      diagnostic
    })));
    symbols.push(...buildSymbols(document, output, sourceHash, symbolIdCounts));
    return extractReferenceCandidates(document);
  });

  const resolvedReferences = resolveReferences(references, symbols);
  diagnostics.push(...createReferenceDiagnostics(resolvedReferences));
  return {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    documents: indexedDocuments,
    symbols: sortSymbols(markDuplicates(symbols)),
    references: resolvedReferences,
    diagnostics: sortDiagnostics(diagnostics)
  };
};
