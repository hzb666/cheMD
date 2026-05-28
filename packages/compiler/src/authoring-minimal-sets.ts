import type { ChemdProgramDocument } from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import { collectObjectDeclarations } from "./authoring-document";
import type {
  AuthoringMinimalSet,
  AuthoringMinimalSetStatus,
  AuthoringSuggestion
} from "./authoring-types";

const uniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const resolveMinimalSetStatus = (missing: string[], inferable: string[]): AuthoringMinimalSetStatus =>
  missing.length > 0
    ? "needs_author_input"
    : inferable.length > 0
      ? "fixable_by_suggestion"
      : "complete";

const createMinimalSet = (input: {
  checklist_id: string;
  title: string;
  description: string;
  missing_items: string[];
  inferable_items: string[];
  suggestion_ids: string[];
}): AuthoringMinimalSet => ({
  checklist_id: input.checklist_id,
  title: input.title,
  description: input.description,
  status: resolveMinimalSetStatus(input.missing_items, input.inferable_items),
  missing_items: input.missing_items,
  inferable_items: input.inferable_items,
  suggestion_ids: uniqueStrings(input.suggestion_ids)
});

interface ReferenceDeclarationStatus {
  declarationId: string;
  hasRef: boolean;
}

const collectReferenceDeclarations = (
  document: ChemdProgramDocument
): ReferenceDeclarationStatus[] =>
  collectObjectDeclarations(document)
    .filter((item) => item.kind === "analysis" || item.kind === "procedure" || item.kind === "observation")
    .map((item) => ({
      declarationId: item.id,
      hasRef: typeof item.ref === "string" && item.ref.trim().length > 0
    }));

const targetsDeclaration = (suggestion: AuthoringSuggestion, declarationId: string): boolean =>
  (suggestion.target?.kind === "declaration" && suggestion.target.declarationId === declarationId)
  || (
    suggestion.target?.kind === "declaration_field"
    && suggestion.target.declarationId === declarationId
  );

const suggestionsForDeclaration = (
  suggestions: AuthoringSuggestion[],
  declarationId: string
): AuthoringSuggestion[] =>
  suggestions.filter((item) => targetsDeclaration(item, declarationId));

const hasDeclarationSuggestion = (
  suggestions: AuthoringSuggestion[],
  declarationId: string | undefined
): boolean =>
  Boolean(declarationId && suggestionsForDeclaration(suggestions, declarationId).length > 0);

const buildReferenceSet = (
  referenceDeclarations: ReferenceDeclarationStatus[],
  suggestions: AuthoringSuggestion[]
): AuthoringMinimalSet | null =>
  referenceDeclarations.length > 0
    ? createMinimalSet({
        checklist_id: "linked-supporting-declarations",
        title: "辅助记录引用",
        description: "analysis / procedure / observation 应尽量显式或可保守推断地指向 reaction 或 attempt。",
        missing_items: referenceDeclarations.flatMap(({ declarationId, hasRef }) =>
          !hasRef && !hasDeclarationSuggestion(suggestions, declarationId) ? [`${declarationId}.ref`] : []
        ),
        inferable_items: referenceDeclarations.flatMap(({ declarationId, hasRef }) =>
          !hasRef && hasDeclarationSuggestion(suggestions, declarationId) ? [`${declarationId}.ref`] : []
        ),
        suggestion_ids: referenceDeclarations.flatMap(({ declarationId, hasRef }) =>
          !hasRef ? suggestionsForDeclaration(suggestions, declarationId).map((item) => item.suggestion_id) : []
        )
      })
    : null;

const buildConditionSet = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  suggestions: AuthoringSuggestion[],
  hasRouteGraphSemantics: boolean
): AuthoringMinimalSet | null => {
  const conditionVariationsPresent = semanticLayer.condition_variations.length > 0
    || (semanticLayer.reactions.length > 1 && !hasRouteGraphSemantics);
  if (!conditionVariationsPresent) return null;

  return createMinimalSet({
    checklist_id: "condition-optimization",
    title: "条件优化记录",
    description: "多反应筛选或 condition_screen 记录应显式标明 standard、factor baseline 与 attempt 结果配对。",
    missing_items: [
      ...(semanticLayer.condition_variations.length === 0 ? ["condition_screen 声明"] : []),
      ...semanticLayer.condition_variations.flatMap((variation) =>
        !variation.standard_ref_raw && !hasDeclarationSuggestion(suggestions, variation.original_id)
          ? [`${variation.original_id}.standard`]
          : []
      )
    ],
    inferable_items: semanticLayer.condition_variations.flatMap((variation) => [
      ...(!variation.standard_ref_raw && hasDeclarationSuggestion(suggestions, variation.original_id)
        ? [`${variation.original_id}.standard`]
        : []),
      ...(!variation.factors?.length && suggestions.some((item) =>
        item.suggestion_id.includes(`baseline-${variation.original_id}`)
      ) ? [`${variation.original_id}.factor`] : [])
    ]),
    suggestion_ids: suggestions
      .filter((item) => item.suggestion_id.startsWith("suggest-condition-"))
      .map((item) => item.suggestion_id)
  });
};

export const buildAuthoringMinimalSets = (
  document: ChemdProgramDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  suggestions: AuthoringSuggestion[]
): AuthoringMinimalSet[] => {
  const hasRouteGraphSemantics = semanticLayer.reactions.some((reaction) =>
    typeof reaction.route_raw === "string"
    || (reaction.prev_refs_raw?.length ?? 0) > 0
    || (reaction.next_refs_raw?.length ?? 0) > 0
  );
  const referenceSet = buildReferenceSet(collectReferenceDeclarations(document), suggestions);
  const conditionSet = buildConditionSet(semanticLayer, suggestions, hasRouteGraphSemantics);

  return [
    createMinimalSet({
      checklist_id: "basic-experiment-record",
      title: "最小实验记录",
      description: "常见实验至少应包含 reaction 与 result，并尽量把 result 指回 reaction。",
      missing_items: [
        ...(semanticLayer.reactions.length === 0 ? ["至少一个 reaction 声明"] : []),
        ...(semanticLayer.results.length === 0 ? ["至少一个 result 声明"] : [])
      ],
      inferable_items: semanticLayer.results.flatMap((result) =>
        hasDeclarationSuggestion(suggestions, result.original_id) ? [`${result.original_id}.ref`] : []
      ),
      suggestion_ids: suggestions
        .filter((item) => item.suggestion_id.startsWith("suggest-result-ref-"))
        .map((item) => item.suggestion_id)
    }),
    referenceSet,
    conditionSet
  ].filter((value): value is AuthoringMinimalSet => Boolean(value));
};
