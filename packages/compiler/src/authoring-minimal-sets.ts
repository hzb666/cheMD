import type { ChemdDocument } from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

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

interface ReferenceNodeStatus {
  nodeId: string;
  hasRef: boolean;
}

const collectReferenceNodes = (document: ChemdDocument): ReferenceNodeStatus[] =>
  document.children.flatMap((node) => {
    if (
      (node.type === "analysis" || node.type === "procedure" || node.type === "observation")
      && typeof node.id === "string"
      && node.id.length > 0
    ) {
      return [{
        nodeId: node.id,
        hasRef: typeof node.ref === "string" && node.ref.trim().length > 0
      }];
    }

    if (node.type === "col" && Array.isArray(node.children)) {
      return collectReferenceNodes({ ...document, children: node.children });
    }

    if (node.type === "template" && Array.isArray(node.body)) {
      return collectReferenceNodes({ ...document, children: node.body });
    }

    return [];
  });

export const buildAuthoringMinimalSets = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  suggestions: AuthoringSuggestion[]
): AuthoringMinimalSet[] => {
  const hasRouteGraphSemantics = semanticLayer.reactions.some((reaction) =>
    typeof reaction.route_raw === "string"
    || (reaction.prev_refs_raw?.length ?? 0) > 0
    || (reaction.next_refs_raw?.length ?? 0) > 0
  );
  const referenceNodes = collectReferenceNodes(document);
  const basicMissing = [
    ...(semanticLayer.reactions.length === 0 ? ["至少一个 reaction 块"] : []),
    ...(semanticLayer.results.length === 0 ? ["至少一个 result 块"] : [])
  ];
  const basicInferable = semanticLayer.results
    .filter((result) => !result.ref_raw && !result.reaction_ref_raw)
    .flatMap((result) =>
      suggestions.some((item) => item.target_block_id === result.original_id)
        ? [`${result.original_id}.ref`]
        : []
    );
  const referenceSet = referenceNodes.length > 0
    ? createMinimalSet({
        checklist_id: "linked-supporting-blocks",
        title: "辅助记录引用",
        description: "analysis / procedure / observation 应尽量显式或可保守推断地指向 reaction 或 attempt。",
        missing_items: referenceNodes.flatMap(({ nodeId, hasRef }) =>
          !hasRef && !suggestions.some((item) => item.target_block_id === nodeId)
            ? [`${nodeId}.ref`]
            : []
        ),
        inferable_items: referenceNodes.flatMap(({ nodeId, hasRef }) =>
          !hasRef && suggestions.some((item) => item.target_block_id === nodeId)
            ? [`${nodeId}.ref`]
            : []
        ),
        suggestion_ids: referenceNodes.flatMap(({ nodeId, hasRef }) =>
          !hasRef
            ? suggestions.filter((item) => item.target_block_id === nodeId).map((item) => item.suggestion_id)
            : []
        )
      })
    : null;
  const conditionVariationsPresent = semanticLayer.condition_variations.length > 0
    || (semanticLayer.reactions.length > 1 && !hasRouteGraphSemantics);
  const conditionSet = conditionVariationsPresent
    ? createMinimalSet({
        checklist_id: "condition-optimization",
        title: "条件优化记录",
        description: "多反应筛选或 condition-varies 记录应显式标明 standard、baseline 与 attempt 结果配对。",
        missing_items: [
          ...(semanticLayer.condition_variations.length === 0 ? ["condition-varies 块"] : []),
          ...semanticLayer.condition_variations.flatMap((variation) =>
            !variation.standard_ref_raw
            && !suggestions.some((item) => item.target_block_id === variation.original_id)
              ? [`${variation.original_id}.standard`]
              : []
          )
        ],
        inferable_items: semanticLayer.condition_variations.flatMap((variation) => [
          ...(!variation.standard_ref_raw
            && suggestions.some((item) => item.target_block_id === variation.original_id)
            ? [`${variation.original_id}.standard`]
            : []),
          ...(!variation.condition?.length
            && suggestions.some((item) => item.suggestion_id.includes(`baseline-${variation.original_id}`))
            ? [`${variation.original_id}.condition`]
            : [])
        ]),
        suggestion_ids: suggestions
          .filter((item) => item.suggestion_id.startsWith("suggest-condition-"))
          .map((item) => item.suggestion_id)
      })
    : null;

  return [
    createMinimalSet({
      checklist_id: "basic-experiment-record",
      title: "最小实验记录",
      description: "常见实验至少应包含 reaction 与 result，并尽量把 result 指回 reaction。",
      missing_items: basicMissing,
      inferable_items: basicInferable,
      suggestion_ids: suggestions
        .filter((item) => item.suggestion_id.startsWith("suggest-result-ref-"))
        .map((item) => item.suggestion_id)
    }),
    referenceSet,
    conditionSet
  ].filter((value): value is AuthoringMinimalSet => Boolean(value));
};
