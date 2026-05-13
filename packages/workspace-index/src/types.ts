import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdSourceRange
} from "@chemd/language-service";

export type WorkspaceIndexVersion = "chemd-workspace-symbol-index/v0.1";

export interface WorkspaceDocumentInput {
  uri: string;
  path?: string;
  source: string;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceIndexCompileInput {
  source: string;
  documentUri: string;
}

export type WorkspaceIndexCompileFn = (
  input: WorkspaceIndexCompileInput
) => ChemdLanguageCompileOutput;

export interface WorkspaceIndexedDocument {
  uri: string;
  path?: string;
  metadata?: Record<string, unknown>;
  sourceHash: string;
  status: "ok" | "failed";
}

export interface WorkspaceSymbol {
  symbolId: string;
  documentUri: string;
  documentPath?: string;
  localId: string;
  label: string;
  kind: string;
  range: ChemdSourceRange;
  sourceHash: string;
  duplicateLocalId: boolean;
  stale?: boolean;
}

export type WorkspaceReferenceStatus = "resolved" | "unresolved" | "ambiguous";

export interface WorkspaceReference {
  referenceId: string;
  documentUri: string;
  documentPath?: string;
  field: string;
  rawText: string;
  targetText: string;
  targetDocumentAlias?: string;
  targetLocalId: string;
  range: ChemdSourceRange;
  status: WorkspaceReferenceStatus;
  targetSymbolIds: string[];
}

export interface WorkspaceIndexDiagnostic {
  documentUri: string;
  diagnostic: ChemdEditorDiagnostic;
}

export interface WorkspaceSymbolIndex {
  version: WorkspaceIndexVersion;
  generatedAt: string;
  documents: WorkspaceIndexedDocument[];
  symbols: WorkspaceSymbol[];
  references: WorkspaceReference[];
  diagnostics: WorkspaceIndexDiagnostic[];
}

export interface WorkspaceIndexSummary {
  documentCount: number;
  failedDocumentCount: number;
  symbolCount: number;
  referenceCount: number;
  resolvedReferenceCount: number;
  unresolvedReferenceCount: number;
  ambiguousReferenceCount: number;
  diagnosticCount: number;
}
