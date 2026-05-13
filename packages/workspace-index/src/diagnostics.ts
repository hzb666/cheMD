import type { ChemdEditorDiagnostic, ChemdSourceRange } from "@chemd/language-service";
import type { WorkspaceIndexDiagnostic, WorkspaceReference } from "./types";

const createDiagnostic = (
  code: string,
  message: string,
  range: ChemdSourceRange
): ChemdEditorDiagnostic => ({
  code,
  severity: "warning",
  message,
  range,
  quickFixes: []
});

export const createCompileFailureDiagnostic = (
  documentUri: string,
  message: string
): WorkspaceIndexDiagnostic => ({
  documentUri,
  diagnostic: createDiagnostic("E_WORKSPACE_COMPILE_FAILED", message, {
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1
  })
});

export const createReferenceDiagnostics = (
  references: readonly WorkspaceReference[]
): WorkspaceIndexDiagnostic[] =>
  references.flatMap((reference) => {
    if (reference.status === "resolved") return [];
    const code = reference.status === "ambiguous"
      ? "W_WORKSPACE_REFERENCE_AMBIGUOUS"
      : "W_WORKSPACE_REFERENCE_UNRESOLVED";
    const message = reference.status === "ambiguous"
      ? `Ambiguous workspace reference: ${reference.targetText}`
      : `Unresolved workspace reference: ${reference.targetText}`;
    return [{
      documentUri: reference.documentUri,
      diagnostic: createDiagnostic(code, message, reference.range)
    }];
  });
