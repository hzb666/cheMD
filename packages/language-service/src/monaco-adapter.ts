import type {
  ChemdEditorDiagnostic,
  ChemdQuickFixProposal,
  ChemdSourceRange
} from "./types";

export type MonacoMarkerSeverity = 1 | 2 | 4 | 8;

export interface MonacoRangeLike {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export interface MonacoMarkerLike extends MonacoRangeLike {
  code: string;
  message: string;
  severity: MonacoMarkerSeverity;
  source: "chemd";
}

export interface MonacoCodeActionLike {
  title: string;
  diagnostics: MonacoMarkerLike[];
  edit: {
    edits: Array<{
      range: MonacoRangeLike;
      text: string;
    }>;
  };
  data: ChemdQuickFixProposal;
}

export const toMonacoRange = (range: ChemdSourceRange): MonacoRangeLike => ({
  startLineNumber: range.startLine,
  startColumn: range.startColumn,
  endLineNumber: range.endLine,
  endColumn: range.endColumn
});

export const toMonacoSeverity = (
  severity: ChemdEditorDiagnostic["severity"]
): MonacoMarkerSeverity => {
  if (severity === "error") {
    return 8;
  }

  return severity === "warning" ? 4 : 2;
};

export const toMonacoMarker = (
  diagnostic: ChemdEditorDiagnostic
): MonacoMarkerLike => ({
  ...toMonacoRange(diagnostic.range),
  code: diagnostic.code,
  message: diagnostic.message,
  severity: toMonacoSeverity(diagnostic.severity),
  source: "chemd"
});

export const toMonacoCodeActions = (
  diagnostic: ChemdEditorDiagnostic
): MonacoCodeActionLike[] => {
  const marker = toMonacoMarker(diagnostic);

  return diagnostic.quickFixes.map((proposal) => ({
    title: proposal.title,
    diagnostics: [marker],
    edit: {
      edits: proposal.patch.edits.map((edit) => ({
        range: toMonacoRange(edit.range),
        text: edit.replacement
      }))
    },
    data: proposal
  }));
};
