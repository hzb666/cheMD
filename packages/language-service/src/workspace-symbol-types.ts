import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileInput,
  ChemdLanguageCompileOutput,
  ChemdSourceRange
} from "./types";

export interface ChemdWorkspaceSymbolDocumentEntry
  extends Pick<ChemdLanguageCompileInput, "source" | "options"> {
  documentUri: string;
  compileOutput?: ChemdLanguageCompileOutput;
  stale?: boolean;
}

export interface ChemdWorkspaceSymbolDocument {
  documentId: string;
  documentUri: string;
  sourceHash: string;
  status: ChemdLanguageCompileOutput["status"];
  compiledAt: string;
  stale: boolean;
  symbolCount: number;
  diagnostics: ChemdEditorDiagnostic[];
}

export interface ChemdWorkspaceSymbol {
  id: string;
  localId: string;
  name: string;
  kind: string;
  documentId: string;
  documentUri: string;
  range: ChemdSourceRange;
  sourceHash: string;
  sourceNodeType?: string;
  summary: string;
  stale: boolean;
}

export interface ChemdWorkspaceDiagnosticsSummary {
  totalDocuments: number;
  okDocuments: number;
  failedDocuments: number;
  totalDiagnostics: number;
  errors: number;
  warnings: number;
  infos: number;
}

export interface ChemdWorkspaceSymbolIndex {
  documents: ChemdWorkspaceSymbolDocument[];
  symbols: ChemdWorkspaceSymbol[];
  symbolsByKind: Record<string, ChemdWorkspaceSymbol[]>;
  symbolIdsByName: Record<string, string[]>;
  diagnosticsSummary: ChemdWorkspaceDiagnosticsSummary;
}
