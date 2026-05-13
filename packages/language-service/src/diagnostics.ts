import type { Diagnostic, SourceRange } from "@chemd/core";
import { buildQuickFixProposals } from "./quick-fix";
import { createStartRange } from "./ranges";
import type {
  ChemdEditorDiagnostic,
  ChemdSourceRange
} from "./types";

const mapSourceRange = (range: SourceRange | undefined): ChemdSourceRange =>
  range
    ? {
        startLine: range.start.line,
        startColumn: range.start.column,
        endLine: range.end.line,
        endColumn: range.end.column
      }
    : createStartRange();

export const mapCompilerDiagnostic = (
  source: string,
  diagnostic: Diagnostic
): ChemdEditorDiagnostic => {
  const range = mapSourceRange(diagnostic.position);

  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    range,
    sourceNodeId: diagnostic.sourceNodeId ?? diagnostic.nodeId,
    quickFixes: buildQuickFixProposals(source, diagnostic, range)
  };
};

export const mapCompilerDiagnostics = (
  source: string,
  diagnostics: Diagnostic[]
): ChemdEditorDiagnostic[] => diagnostics.map((diagnostic) =>
  mapCompilerDiagnostic(source, diagnostic)
);

export const createFailedDiagnostic = (
  message: string
): ChemdEditorDiagnostic => ({
  code: "LS_COMPILE_FAILED",
  severity: "error",
  message,
  range: createStartRange(),
  quickFixes: []
});
