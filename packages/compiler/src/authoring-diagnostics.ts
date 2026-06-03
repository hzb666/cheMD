import {
  createDiagnostic,
  type ChemdDeclaration,
  type ChemdProgramDocument,
  type Diagnostic,
  type DiagnosticQuickFix,
  type SourceSpan
} from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import type {
  AuthoringAssistance,
  AuthoringPatch,
  AuthoringTarget,
  AuthoringSuggestion
} from "./authoring-types";

export const APPLY_AUTHORING_PATCH_QUICK_FIX_KIND = "apply_authoring_patch";

const readFieldFromLine = (line: string): string | undefined => {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const field = line.slice(0, separatorIndex).trim();
  return field.length > 0 ? field : undefined;
};

const readSourceField = (patch: AuthoringPatch): string | undefined => {
  if (patch.kind === "batch") {
    return patch.patches.flatMap((item) => {
      const field = readSourceField(item);
      return field ? [field] : [];
    })[0];
  }

  return patch.kind === "insert_declaration_field"
    || patch.kind === "insert_meta_field"
    ? readFieldFromLine(patch.line)
    : undefined;
};

const readSourceNodeId = (target: AuthoringTarget | undefined): string | undefined => {
  if (!target) return undefined;
  if (target.kind === "document") return target.documentId;
  if (target.kind === "declaration") return target.declarationId;
  if (target.kind === "declaration_field") return target.declarationId;
  if (target.kind === "doc_comment") return target.docId;
  return undefined;
};

const readTargetFacts = (target: AuthoringTarget | undefined): Record<string, string> => {
  if (!target) return {};
  if (target.kind === "declaration_field") {
    return {
      target_kind: target.kind,
      target_declaration_id: target.declarationId,
      target_field: target.field
    };
  }
  return { target_kind: target.kind };
};

const createApplyPatchQuickFix = (
  title: string,
  patch: AuthoringPatch
): DiagnosticQuickFix => ({
  title,
  kind: APPLY_AUTHORING_PATCH_QUICK_FIX_KIND,
  patch
});

const buildSuggestionDiagnostic = (
  suggestion: AuthoringSuggestion,
  document?: ChemdProgramDocument
): Diagnostic =>
  createDiagnostic({
    code: "W_AUTHORING_FIX_AVAILABLE",
    severity: "warning",
    message: suggestion.description,
    nodeId: readSourceNodeId(suggestion.target),
    sourceLayer: "compiler",
    sourceNodeId: readSourceNodeId(suggestion.target),
    sourceField: readSourceField(suggestion.patch),
    facts: {
      authoring_category: suggestion.category,
      suggestion_id: suggestion.suggestion_id,
      ...readTargetFacts(suggestion.target)
    },
    sourceSpan: readTargetSourceSpan(document, suggestion.target),
    quickFixes: [createApplyPatchQuickFix(suggestion.title, suggestion.patch)]
  });

const readTargetSourceSpan = (
  document: ChemdProgramDocument | undefined,
  target: AuthoringTarget | undefined
): SourceSpan | undefined => {
  if (!document || !target) return undefined;
  if (target.kind === "meta_field") {
    return document.meta.fieldSpans?.[target.field] ?? document.meta.sourceSpan;
  }
  if (target.kind === "doc_comment") {
    return document.docs.find((doc) => doc.id === target.docId)?.sourceSpan;
  }
  if (target.kind === "declaration" || target.kind === "declaration_field") {
    const declaration = findDeclaration(document, target.declarationId);
    if (!declaration) return undefined;
    return target.kind === "declaration_field"
      ? readDeclarationFieldSpan(declaration, target.field) ?? declaration.sourceSpan
      : declaration.sourceSpan;
  }
  return undefined;
};

const findDeclaration = (
  document: ChemdProgramDocument,
  declarationId: string
): ChemdDeclaration | undefined =>
  document.declarations.find((declaration) => declaration.id === declarationId);

const readDeclarationFieldSpan = (
  declaration: ChemdDeclaration,
  field: string
): SourceSpan | undefined =>
  "fieldSpans" in declaration ? declaration.fieldSpans?.[field] : undefined;

const buildChecklistDiagnostic = (input: {
  checklistId: string;
  title: string;
  description: string;
  missingItems: string[];
}): Diagnostic =>
  createDiagnostic({
    code: "W_AUTHORING_INPUT_REQUIRED",
    severity: "warning",
    message: `${input.title} 未完整表达：${input.missingItems.join("；")}`,
    sourceLayer: "compiler",
    facts: {
      checklist_id: input.checklistId,
      title: input.title,
      description: input.description,
      missing_items: input.missingItems
    }
  });

const hasProgramSemanticContent = (trainingExport: ChemdTrainingExportV2): boolean =>
  trainingExport.semantic_layer.reactions.length > 0
  || trainingExport.semantic_layer.results.length > 0
  || trainingExport.semantic_layer.analyses.length > 0
  || trainingExport.semantic_layer.condition_variations.length > 0
  || trainingExport.semantic_layer.condition_variation_attempts.length > 0
  || trainingExport.semantic_layer.procedures.length > 0
  || trainingExport.semantic_layer.documentation_blocks.length > 0
  || trainingExport.source_layer.declarations.some((declaration) =>
    ["procedure", "observation", "result", "analysis", "reaction", "condition_screen"].includes(
      declaration.declaration_kind
    )
  );

export const buildAuthoringDiagnostics = (
  assistance: AuthoringAssistance,
  trainingExport: ChemdTrainingExportV2,
  document?: ChemdProgramDocument
): Diagnostic[] => [
  ...assistance.suggestions.map((suggestion) =>
    buildSuggestionDiagnostic(suggestion, document)
  ),
  ...(
    hasProgramSemanticContent(trainingExport) ? assistance.minimal_sets : []
  )
    .filter((item) => item.status === "needs_author_input" && item.missing_items.length > 0)
    .map((item) => buildChecklistDiagnostic({
      checklistId: item.checklist_id,
      title: item.title,
      description: item.description,
      missingItems: item.missing_items
    }))
];
