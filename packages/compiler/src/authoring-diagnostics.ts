import { createDiagnostic, type Diagnostic, type DiagnosticQuickFix } from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import type {
  AuthoringAssistance,
  AuthoringPatch,
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

  return patch.kind === "insert_field_line"
    ? readFieldFromLine(patch.line)
    : undefined;
};

const createApplyPatchQuickFix = (
  title: string,
  patch: AuthoringPatch
): DiagnosticQuickFix => ({
  title,
  kind: APPLY_AUTHORING_PATCH_QUICK_FIX_KIND,
  patch
});

const buildSuggestionDiagnostic = (suggestion: AuthoringSuggestion): Diagnostic =>
  createDiagnostic({
    code: "W_AUTHORING_FIX_AVAILABLE",
    severity: "warning",
    message: suggestion.description,
    nodeId: suggestion.target_block_id,
    sourceLayer: "compiler",
    sourceNodeId: suggestion.target_block_id,
    sourceField: readSourceField(suggestion.patch),
    facts: {
      authoring_category: suggestion.category,
      suggestion_id: suggestion.suggestion_id
    },
    quickFixes: [createApplyPatchQuickFix(suggestion.title, suggestion.patch)]
  });

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
      description: input.description,
      missing_items: input.missingItems
    }
  });

export const buildAuthoringDiagnostics = (
  assistance: AuthoringAssistance,
  trainingExport: ChemdTrainingExportV2
): Diagnostic[] => [
  ...assistance.suggestions.map(buildSuggestionDiagnostic),
  ...(
    trainingExport.semantic_layer.reactions.length > 0
    || trainingExport.semantic_layer.results.length > 0
    || trainingExport.semantic_layer.analyses.length > 0
    || trainingExport.semantic_layer.condition_variations.length > 0
    || trainingExport.semantic_layer.condition_variation_attempts.length > 0
    || trainingExport.source_layer.raw_children.some((node) =>
      ["procedure", "observation", "result", "analysis", "reaction", "condition_varies"].includes(node.node_type)
    )
      ? assistance.minimal_sets
      : []
  )
    .filter((item) => item.status === "needs_author_input" && item.missing_items.length > 0)
    .map((item) => buildChecklistDiagnostic({
      checklistId: item.checklist_id,
      title: item.title,
      description: item.description,
      missingItems: item.missing_items
    }))
];
