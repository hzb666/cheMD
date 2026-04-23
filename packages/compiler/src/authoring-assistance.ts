import type {
  ChemdDocument,
  ChemdNode,
  ConditionVariesNode,
  ObjectNode
} from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import { buildAuthoringMinimalSets } from "./authoring-minimal-sets";
import { buildAuthoringTemplates } from "./authoring-templates";
import type {
  AuthoringAssistance,
  AuthoringSuggestion
} from "./authoring-types";

const CONDITION_FIELDS = ["solvent", "temperature", "catalyst", "time", "atmosphere"] as const;

const collectObjectNodes = (nodes: ChemdNode[]): ObjectNode[] =>
  nodes.flatMap((node) => {
    const nested = node.type === "col" && Array.isArray(node.children)
      ? collectObjectNodes(node.children)
      : node.type === "template" && Array.isArray(node.body)
        ? collectObjectNodes(node.body)
        : [];
    return node.type !== "markdown" && node.type !== "col" && node.type !== "template" && node.type !== "use"
      ? [node, ...nested]
      : nested;
  });

const createSuggestion = (input: {
  suggestion_id: string;
  title: string;
  description: string;
  target_block_id?: string;
  patch: AuthoringSuggestion["patch"];
  category?: AuthoringSuggestion["category"];
}
): AuthoringSuggestion | null =>
  input.target_block_id
    ? {
        suggestion_id: input.suggestion_id,
        title: input.title,
        description: input.description,
        category: input.category ?? "reference",
        confidence: "high",
        target_block_id: input.target_block_id,
        patch: input.patch
      }
    : null;

const buildReactionBaselineLine = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  standardId: string | undefined
): string | undefined => {
  const reaction = semanticLayer.reactions.find((item) => item.original_id === standardId);
  if (!reaction) {
    return undefined;
  }

  const fields = CONDITION_FIELDS.flatMap((field) => {
    const rawValue = reaction[`${field}_raw` as keyof typeof reaction];
    return typeof rawValue === "string" && rawValue.trim()
      ? [`${field}=${rawValue.trim()}`]
      : [];
  });

  return fields.length > 0 ? `condition: ${fields.join(" | ")}` : undefined;
};

const buildRefSuggestions = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const objectNodes = collectObjectNodes(document.children);
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;

  const resultSuggestions = semanticLayer.results.flatMap((result) => {
    if (result.ref_raw || result.reaction_ref_raw || !result.original_id) {
      return [];
    }

    return uniqueReactionId
      ? [createSuggestion({
          suggestion_id: `suggest-result-ref-${result.original_id}`,
          title: `为 ${result.original_id} 补 ref`,
          description: "当前文档只有一个 reaction，可保守补上 result.ref。",
          target_block_id: result.original_id,
          patch: {
            kind: "insert_field_line",
            blockId: result.original_id,
            line: `ref: ${uniqueReactionId}`
          }
        })]
      : [];
  });

  const processNode = (
    blockId: string,
    typeLabel: "procedure" | "observation"
  ): AuthoringSuggestion | null =>
    uniqueReactionId
      ? createSuggestion({
          suggestion_id: `suggest-${typeLabel}-ref-${blockId}`,
          title: `为 ${blockId} 补 ref`,
          description: `当前文档只有一个 reaction，可保守补上 ${typeLabel}.ref。`,
          target_block_id: blockId,
          patch: {
            kind: "insert_field_line",
            blockId,
            line: `ref: ${uniqueReactionId}`
          }
        })
      : null;

  const otherSuggestions = objectNodes.flatMap((node) => {
    if (node.type === "analysis" && !node.ref && uniqueReactionId && node.id) {
      return [createSuggestion({
        suggestion_id: `suggest-analysis-ref-${node.id}`,
        title: `为 ${node.id} 补 ref`,
        description: "当前文档只有一个 reaction，可保守补上 analysis.ref。",
        target_block_id: node.id,
        patch: {
          kind: "insert_field_line",
          blockId: node.id,
          line: `ref: ${uniqueReactionId}`,
          anchorFields: ["type"]
        }
      })];
    }

    if (node.type === "procedure" && node.id) {
      return !node.ref ? [processNode(node.id, "procedure")] : [];
    }

    if (node.type === "observation" && node.id) {
      return !node.ref ? [processNode(node.id, "observation")] : [];
    }

    return [];
  });

  return [...resultSuggestions, ...otherSuggestions].filter((value): value is AuthoringSuggestion => Boolean(value));
};

const buildConditionVariationSuggestions = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const primaryReactionId = semanticLayer.reactions.find((reaction) => reaction.is_primary)?.original_id
    ?? semanticLayer.reactions[0]?.original_id;
  const variationNodes = collectObjectNodes(document.children)
    .filter((node): node is ConditionVariesNode => node.type === "condition_varies");

  return variationNodes.flatMap((node) => {
    const blockId = node.id;
    const variation = semanticLayer.condition_variations.find((item) => item.original_id === blockId);
    const baselineLine = buildReactionBaselineLine(semanticLayer, node.standard);
    const attemptSuggestions = semanticLayer.condition_variation_attempts
      .filter((attempt) => attempt.parent_condition_variation_id === variation?.entity_id)
      .flatMap((attempt) => {
        if (attempt.result_ref_raw || !attempt.reaction_ref_raw || !blockId) {
          return [];
        }

        const matches = semanticLayer.results.filter((result) =>
          (result.ref_raw ?? result.reaction_ref_raw) === attempt.reaction_ref_raw
        );
        return matches.length === 1 && matches[0]?.original_id
          ? [createSuggestion({
              suggestion_id: `suggest-condition-result-${attempt.original_id}`,
              title: `为 ${attempt.original_id} 绑定结果`,
              description: "该尝试的 reaction 已唯一匹配到一个 result，可补 resN。",
              target_block_id: blockId,
              patch: {
                kind: "insert_field_line",
                blockId,
                line: `res${attempt.attempt_id.replace(/^var/i, "")}: ${matches[0].original_id}`,
                anchorFields: [attempt.attempt_id]
              }
            })]
          : [];
      });

    return [
      !node.standard && primaryReactionId && blockId
        ? createSuggestion({
            suggestion_id: `suggest-condition-standard-${blockId}`,
            title: `为 ${blockId} 补 standard`,
            description: "当前文档已有明确主 reaction，可作为 standard。",
            target_block_id: blockId,
            patch: {
              kind: "insert_field_line",
              blockId,
              line: `standard: ${primaryReactionId}`
            },
            category: "inheritance"
          })
        : null,
      !node.condition?.length && baselineLine && blockId
        ? createSuggestion({
            suggestion_id: `suggest-condition-baseline-${blockId}`,
            title: `为 ${blockId} 补 condition baseline`,
            description: "从 standard reaction 的已写条件生成一行 baseline 继承声明。",
            target_block_id: blockId,
            patch: {
              kind: "insert_field_line",
              blockId,
              line: baselineLine,
              anchorFields: ["standard", "reaction"]
            },
            category: "inheritance"
          })
        : null,
      ...attemptSuggestions
    ].filter((value): value is AuthoringSuggestion => Boolean(value));
  });
};

export const buildAuthoringAssistance = (
  document: ChemdDocument,
  trainingExport: ChemdTrainingExportV2
): AuthoringAssistance => {
  const semanticLayer = trainingExport.semantic_layer;
  const suggestions = [
    ...buildRefSuggestions(document, semanticLayer),
    ...buildConditionVariationSuggestions(document, semanticLayer)
  ];

  return {
    minimal_sets: buildAuthoringMinimalSets(document, semanticLayer, suggestions),
    templates: buildAuthoringTemplates(document, semanticLayer),
    suggestions
  };
};
