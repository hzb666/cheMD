import type { Diagnostic, DiagnosticQuickFix as CoreDiagnosticQuickFix } from "@chemd/core";
import type { QuickFix } from "@chemd/diagnostics";
import { applyAuthoringPatch } from "./authoring-apply";
import { APPLY_AUTHORING_PATCH_QUICK_FIX_KIND } from "./authoring-diagnostics";
import type { AuthoringPatch } from "./authoring-types";

export type DiagnosticQuickFix = QuickFix | CoreDiagnosticQuickFix;
export type DiagnosticWithQuickFixes = Diagnostic;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isAuthoringPatch = (value: unknown): value is AuthoringPatch => {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "append_document_text") return typeof value.text === "string";
  if (value.kind === "insert_after_declaration") {
    return typeof value.declarationId === "string" && typeof value.text === "string";
  }
  if (value.kind === "insert_declaration_field") {
    return typeof value.declarationId === "string" && typeof value.line === "string";
  }
  if (value.kind === "insert_meta_field") return typeof value.line === "string";
  if (value.kind === "batch") {
    return Array.isArray(value.patches) && value.patches.every((item) => isAuthoringPatch(item));
  }
  return false;
};

export const applyDiagnosticQuickFix = (
  source: string,
  _diagnostic: DiagnosticWithQuickFixes,
  quickFix: DiagnosticQuickFix
): string => {
  if (quickFix.kind === APPLY_AUTHORING_PATCH_QUICK_FIX_KIND && isAuthoringPatch(quickFix.patch)) {
    return applyAuthoringPatch(source, quickFix.patch);
  }

  return source;
};
