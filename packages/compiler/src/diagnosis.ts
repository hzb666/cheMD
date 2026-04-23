import type { Diagnostic, DiagnosticSeverity } from "@chemd/core";

import {
  applyDiagnosticQuickFix,
  type DiagnosticQuickFix,
  type DiagnosticWithQuickFixes
} from "./quick-fix";

export type CompilerDiagnosisStatus =
  | "clean"
  | "fixable"
  | "needs_author_input"
  | "manual_review"
  | "mixed";

export type CompilerDiagnosisNextAction =
  | "accept"
  | "apply_safe_fixes"
  | "recompile"
  | "ask_for_required_inputs"
  | "manual_rewrite";

export interface CompilerDiagnosisSummary {
  totalDiagnostics: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  safeFixCount: number;
  requiredInputCount: number;
  manualReviewCount: number;
}

export interface CompilerDiagnosisSafeFix {
  fixId: string;
  diagnostic: DiagnosticWithQuickFixes;
  diagnosticCode: string;
  message: string;
  severity: DiagnosticSeverity;
  sourceLayer?: string;
  sourceNodeId?: string;
  sourceField?: string;
  quickFix: DiagnosticQuickFix;
}

export interface CompilerDiagnosisRequiredInput {
  inputId: string;
  checklistId?: string;
  title: string;
  description?: string;
  missingItems: string[];
  diagnostic: Diagnostic;
}

export interface CompilerDiagnosisManualItem {
  itemId: string;
  diagnostic: Diagnostic;
  diagnosticCode: string;
  message: string;
  severity: DiagnosticSeverity;
  sourceLayer?: string;
  sourceNodeId?: string;
  sourceField?: string;
}

export interface CompilerDiagnosis {
  status: CompilerDiagnosisStatus;
  summary: CompilerDiagnosisSummary;
  safeFixes: CompilerDiagnosisSafeFix[];
  requiredInputs: CompilerDiagnosisRequiredInput[];
  manualReviewItems: CompilerDiagnosisManualItem[];
  nextActions: CompilerDiagnosisNextAction[];
}

const REQUIRED_INPUT_CODE = "W_AUTHORING_INPUT_REQUIRED";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readString = (record: Record<string, unknown>, key: string): string | undefined =>
  typeof record[key] === "string" ? record[key] : undefined;

const readStringList = (record: Record<string, unknown>, key: string): string[] => {
  const value = record[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
};

const isRequiredInputDiagnostic = (diagnostic: Diagnostic): boolean =>
  diagnostic.code === REQUIRED_INPUT_CODE;

const countDiagnosticsBySeverity = (
  diagnostics: Diagnostic[],
  severity: DiagnosticSeverity
): number =>
  diagnostics.filter((item) => item.severity === severity).length;

const createSafeFixId = (
  diagnostic: Diagnostic,
  quickFix: DiagnosticQuickFix,
  diagnosticIndex: number,
  quickFixIndex: number
): string => {
  const suggestionId = isRecord(diagnostic.facts)
    ? readString(diagnostic.facts, "suggestion_id")
    : undefined;
  if (suggestionId) {
    return suggestionId;
  }

  const parts = [
    diagnostic.code,
    diagnostic.sourceNodeId ?? diagnostic.nodeId ?? "document",
    diagnostic.sourceField ?? quickFix.kind,
    String(diagnosticIndex + 1),
    String(quickFixIndex + 1)
  ];
  return parts.join(":");
};

const buildSafeFixes = (diagnostics: Diagnostic[]): CompilerDiagnosisSafeFix[] =>
  diagnostics.flatMap((diagnostic, diagnosticIndex) => {
    const quickFixes = diagnostic.quickFixes ?? [];
    if (quickFixes.length === 0) {
      return [];
    }

    const fixableDiagnostic: DiagnosticWithQuickFixes = {
      ...diagnostic,
      quickFixes
    };

    return quickFixes.map((quickFix, quickFixIndex) => ({
      fixId: createSafeFixId(fixableDiagnostic, quickFix, diagnosticIndex, quickFixIndex),
      diagnostic: fixableDiagnostic,
      diagnosticCode: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      sourceLayer: diagnostic.sourceLayer,
      sourceNodeId: diagnostic.sourceNodeId ?? diagnostic.nodeId,
      sourceField: diagnostic.sourceField,
      quickFix
    }));
  });

const buildRequiredInputs = (diagnostics: Diagnostic[]): CompilerDiagnosisRequiredInput[] =>
  diagnostics.flatMap((diagnostic, diagnosticIndex) => {
    if (!isRequiredInputDiagnostic(diagnostic)) {
      return [];
    }

    const facts = isRecord(diagnostic.facts) ? diagnostic.facts : {};
    const checklistId = readString(facts, "checklist_id");
    const title = readString(facts, "title") ?? diagnostic.message;

    return [{
      inputId: checklistId ?? `required-input-${diagnosticIndex + 1}`,
      checklistId,
      title,
      description: readString(facts, "description"),
      missingItems: readStringList(facts, "missing_items"),
      diagnostic
    }];
  });

const buildManualReviewItems = (diagnostics: Diagnostic[]): CompilerDiagnosisManualItem[] =>
  diagnostics.flatMap((diagnostic, diagnosticIndex) => {
    const hasSafeFix = (diagnostic.quickFixes?.length ?? 0) > 0;
    const isRequiredInput = isRequiredInputDiagnostic(diagnostic);

    if (diagnostic.severity === "info" || hasSafeFix || isRequiredInput) {
      return [];
    }

    return [{
      itemId: `${diagnostic.code}:${diagnosticIndex + 1}`,
      diagnostic,
      diagnosticCode: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      sourceLayer: diagnostic.sourceLayer,
      sourceNodeId: diagnostic.sourceNodeId ?? diagnostic.nodeId,
      sourceField: diagnostic.sourceField
    }];
  });

const buildStatus = (input: {
  safeFixes: CompilerDiagnosisSafeFix[];
  requiredInputs: CompilerDiagnosisRequiredInput[];
  manualReviewItems: CompilerDiagnosisManualItem[];
}): CompilerDiagnosisStatus => {
  const hasSafeFixes = input.safeFixes.length > 0;
  const hasRequiredInputs = input.requiredInputs.length > 0;
  const hasManualReview = input.manualReviewItems.length > 0;

  if (!hasSafeFixes && !hasRequiredInputs && !hasManualReview) {
    return "clean";
  }

  if (hasSafeFixes && !hasRequiredInputs && !hasManualReview) {
    return "fixable";
  }

  if (!hasSafeFixes && hasRequiredInputs && !hasManualReview) {
    return "needs_author_input";
  }

  if (!hasSafeFixes && !hasRequiredInputs && hasManualReview) {
    return "manual_review";
  }

  return "mixed";
};

const buildNextActions = (input: {
  safeFixes: CompilerDiagnosisSafeFix[];
  requiredInputs: CompilerDiagnosisRequiredInput[];
  manualReviewItems: CompilerDiagnosisManualItem[];
}): CompilerDiagnosisNextAction[] => {
  const actions: CompilerDiagnosisNextAction[] = [];

  if (input.safeFixes.length > 0) {
    actions.push("apply_safe_fixes", "recompile");
  }

  if (input.requiredInputs.length > 0) {
    actions.push("ask_for_required_inputs");
  }

  if (input.manualReviewItems.length > 0) {
    actions.push("manual_rewrite");
  }

  return actions.length > 0 ? actions : ["accept"];
};

export const buildCompilerDiagnosis = (
  diagnostics: Diagnostic[]
): CompilerDiagnosis => {
  const safeFixes = buildSafeFixes(diagnostics);
  const requiredInputs = buildRequiredInputs(diagnostics);
  const manualReviewItems = buildManualReviewItems(diagnostics);

  return {
    status: buildStatus({ safeFixes, requiredInputs, manualReviewItems }),
    summary: {
      totalDiagnostics: diagnostics.length,
      errorCount: countDiagnosticsBySeverity(diagnostics, "error"),
      warningCount: countDiagnosticsBySeverity(diagnostics, "warning"),
      infoCount: countDiagnosticsBySeverity(diagnostics, "info"),
      safeFixCount: safeFixes.length,
      requiredInputCount: requiredInputs.length,
      manualReviewCount: manualReviewItems.length
    },
    safeFixes,
    requiredInputs,
    manualReviewItems,
    nextActions: buildNextActions({ safeFixes, requiredInputs, manualReviewItems })
  };
};

export const applyCompilerDiagnosisSafeFixes = (
  source: string,
  diagnosis: CompilerDiagnosis
): string =>
  diagnosis.safeFixes.reduce(
    (currentSource, item) => applyDiagnosticQuickFix(currentSource, item.diagnostic, item.quickFix),
    source
  );
