import type { CompileOptions, CompileResult } from "@chemd/compiler";

export interface ChemdSourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ChemdTextEdit {
  range: ChemdSourceRange;
  replacement: string;
}

export interface ChemdTextPatch {
  beforeHash: string;
  edits: ChemdTextEdit[];
}

export interface ChemdQuickFixProposal {
  id: string;
  title: string;
  diagnosticCode?: string;
  sourceRange: ChemdSourceRange;
  patch: ChemdTextPatch;
}

export interface ChemdEditorDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  range: ChemdSourceRange;
  sourceNodeId?: string;
  quickFixes: ChemdQuickFixProposal[];
}

export type ChemdOutlineKind =
  | "metadata"
  | "molecule"
  | "reaction"
  | "result"
  | "analysis"
  | "sample"
  | "procedure"
  | "observation"
  | "template";

export interface ChemdOutlineItem {
  id: string;
  label: string;
  kind: ChemdOutlineKind;
  range: ChemdSourceRange;
  children?: ChemdOutlineItem[];
}

export interface ChemdSymbol {
  id: string;
  label: string;
  kind: string;
  range: ChemdSourceRange;
  sourceNodeType?: string;
}

export interface ChemdLanguageCompileInput {
  source: string;
  documentUri?: string;
  options?: Pick<CompileOptions, "strictChemdKind" | "procedureMode">;
}

interface ChemdLanguageCompileOutputBase {
  documentUri?: string;
  compiledAt: string;
  diagnostics: ChemdEditorDiagnostic[];
  outline: ChemdOutlineItem[];
  symbols: ChemdSymbol[];
}

export interface ChemdLanguageCompileSuccess extends ChemdLanguageCompileOutputBase {
  status: "ok";
  result: CompileResult;
}

export interface ChemdLanguageCompileFailure extends ChemdLanguageCompileOutputBase {
  status: "failed";
  result?: undefined;
  error: {
    code: "LS_COMPILE_FAILED";
    message: string;
  };
}

export type ChemdLanguageCompileOutput =
  | ChemdLanguageCompileSuccess
  | ChemdLanguageCompileFailure;
