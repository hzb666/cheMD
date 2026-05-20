import type {
  ChemdDocument,
  ConditionVariesNode
} from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import { collectObjectNodes } from "./authoring-document";
import { buildAuthoringMinimalSets } from "./authoring-minimal-sets";
import { buildAuthoringTemplates } from "./authoring-templates";
import type {
  AuthoringAssistance,
  AuthoringSuggestion
} from "./authoring-types";

const CONDITION_FIELDS = ["solvent", "temperature", "catalyst", "time", "atmosphere"] as const;

const hasMetaValue = (document: ChemdDocument, field: string): boolean =>
  typeof document.meta[field] === "string" && document.meta[field].trim().length > 0;

const normalizeRef = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^@/, "") : undefined;
};

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

const createDocumentSuggestion = (input: {
  suggestion_id: string;
  title: string;
  description: string;
  document_id: string;
  line: string;
  anchorFields?: string[];
}): AuthoringSuggestion => ({
  suggestion_id: input.suggestion_id,
  title: input.title,
  description: input.description,
  category: "structure",
  confidence: "high",
  target_block_id: input.document_id,
  patch: {
    kind: "insert_frontmatter_line",
    line: input.line,
    anchorFields: input.anchorFields
  }
});

const buildReactionBaselineLines = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  standardId: string | undefined
): string[] => {
  const normalizedStandardId = normalizeRef(standardId);
  const reaction = semanticLayer.reactions.find((item) => item.original_id === normalizedStandardId);
  if (!reaction) {
    return [];
  }

  return CONDITION_FIELDS.flatMap((field) => {
    const rawValue = reaction[`${field}_raw` as keyof typeof reaction];
    return typeof rawValue === "string" && rawValue.trim()
      ? [`factor: ${field} | baseline=${rawValue.trim()}`]
      : [];
  });
};

const getDocumentPrimaryReactionId = (document: ChemdDocument): string | undefined => {
  const value = document.meta.primary_reaction;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const getReactionOriginalIds = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): string[] =>
  semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

const buildPrimaryMetaSuggestions = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const documentId = typeof document.meta.id === "string" && document.meta.id.trim()
    ? document.meta.id.trim()
    : "document";
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const resultIds = semanticLayer.results
    .map((result) => result.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;
  const uniqueResultId = resultIds.length === 1 ? resultIds[0] : undefined;
  const primaryResultId = typeof document.meta.primary_result === "string" && document.meta.primary_result.trim()
    ? document.meta.primary_result.trim()
    : uniqueResultId;
  const primaryResult = semanticLayer.results.find((result) => result.original_id === primaryResultId);
  const primaryResultReactionId = primaryResult
    ? inferResultReactionId(semanticLayer, primaryResult)
    : undefined;
  const inferredPrimaryReactionId = uniqueReactionId
    ?? (primaryResultReactionId && reactionIds.includes(primaryResultReactionId)
      ? primaryResultReactionId
      : undefined);

  return [
    !hasMetaValue(document, "primary_reaction") && inferredPrimaryReactionId
      ? createDocumentSuggestion({
          suggestion_id: `suggest-primary-reaction-${inferredPrimaryReactionId}`,
          title: "补 primary_reaction",
          description: "当前文档有唯一可判定的主 reaction，可保守补上 primary_reaction。",
          document_id: documentId,
          line: `primary_reaction: ${inferredPrimaryReactionId}`,
          anchorFields: ["id", "title", "date"]
        })
      : null,
    !hasMetaValue(document, "primary_result") && uniqueResultId
      ? createDocumentSuggestion({
          suggestion_id: `suggest-primary-result-${uniqueResultId}`,
          title: "补 primary_result",
          description: "当前文档只有一个 result，可保守补上 primary_result。",
          document_id: documentId,
          line: `primary_result: ${uniqueResultId}`,
          anchorFields: ["date", "primary_reaction"]
        })
      : null
  ].filter((value): value is AuthoringSuggestion => Boolean(value));
};

const inferResultReactionId = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  result: ChemdTrainingExportV2["semantic_layer"]["results"][number]
): string | undefined => {
  const explicitReactionId = normalizeRef(result.reaction_ref_raw ?? result.ref_raw);
  if (explicitReactionId) {
    return explicitReactionId;
  }

  const productRef = normalizeRef(result.product_ref_raw);
  if (!productRef) {
    return undefined;
  }

  const matches = semanticLayer.reactions.filter((reaction) =>
    reaction.products.some((product) =>
      normalizeRef(product.raw) === productRef
      || normalizeRef(product.target_original_id) === productRef
    )
  );

  return matches.length === 1 ? matches[0]?.original_id : undefined;
};

const buildResultProductSuggestions = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] =>
  semanticLayer.results.flatMap((result) => {
    if (result.product_ref_raw || !result.original_id) {
      return [];
    }

    const uniqueReactionId = semanticLayer.reactions.length === 1
      ? semanticLayer.reactions[0]?.original_id
      : undefined;
    const reactionRef = inferResultReactionId(semanticLayer, result) ?? uniqueReactionId;
    const reaction = semanticLayer.reactions.find((item) => item.original_id === reactionRef);
    const product = reaction?.products.length === 1 ? reaction.products[0] : undefined;
    if (!product?.raw) {
      return [];
    }

    return [createSuggestion({
      suggestion_id: `suggest-result-product-${result.original_id}`,
      title: `为 ${result.original_id} 补 product`,
      description: "该 result 指向的 reaction 只有一个 product，可保守补上 result.product。",
      target_block_id: result.original_id,
      patch: {
        kind: "insert_field_line",
        blockId: result.original_id,
        line: `product: ${product.raw}`,
        anchorFields: ["status", "reaction", "ref"]
      },
      category: "reference"
    })].filter((value): value is AuthoringSuggestion => Boolean(value));
  });

const buildRefSuggestions = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const objectNodes = collectObjectNodes(document.children);
  const uniqueAttemptOriginalId = semanticLayer.condition_variation_attempts.length === 1
    ? semanticLayer.condition_variation_attempts[0]?.original_id
    : undefined;
  const uniqueAttemptRef = uniqueAttemptOriginalId ? `@${uniqueAttemptOriginalId}` : undefined;
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;

  const resultSuggestions = semanticLayer.results.flatMap((result) => {
    if (result.ref_raw || result.reaction_ref_raw || !result.original_id) {
      return [];
    }

    const inferredReactionId = inferResultReactionId(semanticLayer, result) ?? uniqueReactionId;

    return inferredReactionId
      ? [createSuggestion({
          suggestion_id: `suggest-result-ref-${result.original_id}`,
          title: `为 ${result.original_id} 补 ref`,
          description: "当前 result 可唯一匹配 reaction，可保守补上 result.ref。",
          target_block_id: result.original_id,
          patch: {
            kind: "insert_field_line",
            blockId: result.original_id,
            line: `ref: ${inferredReactionId}`
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
    if (node.type === "analysis" && !node.ref && node.id) {
      const targetRef = uniqueAttemptRef ?? uniqueReactionId;
      if (!targetRef) {
        return [];
      }

      return [createSuggestion({
        suggestion_id: `suggest-analysis-ref-${node.id}`,
        title: `为 ${node.id} 补 ref`,
        description: uniqueAttemptRef
          ? "当前文档只有一个 condition-varies attempt，可保守补上 analysis.ref。"
          : "当前文档只有一个 reaction，可保守补上 analysis.ref。",
        target_block_id: node.id,
        patch: {
          kind: "insert_field_line",
          blockId: node.id,
          line: `ref: ${targetRef}`,
          anchorFields: ["type"]
        }
      })].filter((value): value is AuthoringSuggestion => Boolean(value));
    }

    if (node.type === "procedure" && node.id) {
      return !node.ref ? [processNode(node.id, "procedure")] : [];
    }

    if (node.type === "observation" && node.id) {
      if (node.ref) {
        return [];
      }

      return uniqueAttemptRef
        ? [createSuggestion({
            suggestion_id: `suggest-observation-ref-${node.id}`,
            title: `为 ${node.id} 补 ref`,
            description: "当前文档只有一个 condition-varies attempt，可保守补上 observation.ref。",
            target_block_id: node.id,
            patch: {
              kind: "insert_field_line",
              blockId: node.id,
              line: `ref: ${uniqueAttemptRef}`
            }
          })]
        : [processNode(node.id, "observation")];
    }

    return [];
  });

  return [...resultSuggestions, ...otherSuggestions].filter((value): value is AuthoringSuggestion => Boolean(value));
};

const buildConditionVariationSuggestions = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const explicitPrimaryReactionId = getDocumentPrimaryReactionId(document);
  const reactionIds = getReactionOriginalIds(semanticLayer);
  const variationNodes = collectObjectNodes(document.children)
    .filter((node): node is ConditionVariesNode => node.type === "condition_varies");

  return variationNodes.flatMap((node) =>
    buildSingleConditionVariationSuggestions({
      explicitPrimaryReactionId,
      node,
      reactionIds,
      semanticLayer
    })
  );
};

const buildSingleConditionVariationSuggestions = (input: {
  explicitPrimaryReactionId?: string;
  node: ConditionVariesNode;
  reactionIds: string[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
}): AuthoringSuggestion[] => {
  const blockId = input.node.id;
  const inferredStandardId = inferConditionStandardId(input);
  const baselineLines = buildReactionBaselineLines(input.semanticLayer, input.node.standard);

  return [
    createConditionStandardSuggestion(input.node, inferredStandardId),
    createConditionBaselineSuggestion(input.node, baselineLines),
    ...buildAttemptResultSuggestions(input.semanticLayer, blockId)
  ].filter((value): value is AuthoringSuggestion => Boolean(value));
};

const inferConditionStandardId = (input: {
  explicitPrimaryReactionId?: string;
  node: ConditionVariesNode;
  reactionIds: string[];
}): string | undefined => {
  const attemptReactionIds = new Set((input.node.attempts ?? []).flatMap((attempt) =>
    normalizeRef(attempt.reaction) ? [normalizeRef(attempt.reaction) as string] : []
  ));
  const unusedReactionIds = input.reactionIds.filter((reactionId) => !attemptReactionIds.has(reactionId));

  return input.explicitPrimaryReactionId
    ?? (input.reactionIds.length === 1 ? input.reactionIds[0] : undefined)
    ?? (unusedReactionIds.length === 1 ? unusedReactionIds[0] : undefined);
};

const createConditionStandardSuggestion = (
  node: ConditionVariesNode,
  inferredStandardId: string | undefined
): AuthoringSuggestion | null =>
  !node.standard && inferredStandardId && node.id
    ? createSuggestion({
        suggestion_id: `suggest-condition-standard-${node.id}`,
        title: `为 ${node.id} 补 standard`,
        description: "当前文档有唯一可判定的 baseline reaction，可作为 standard。",
        target_block_id: node.id,
        patch: {
          kind: "insert_field_line",
          blockId: node.id,
          line: `standard: @${inferredStandardId}`
        },
        category: "inheritance"
      })
    : null;

const createConditionBaselineSuggestion = (
  node: ConditionVariesNode,
  baselineLines: string[]
): AuthoringSuggestion | null =>
  !node.factors?.length && baselineLines.length > 0 && node.id
    ? createSuggestion({
        suggestion_id: `suggest-condition-baseline-${node.id}`,
        title: `为 ${node.id} 补 factor baseline`,
        description: "从 standard reaction 的已写条件生成 factor baseline 声明。",
        target_block_id: node.id,
        patch: {
          kind: "batch",
          patches: baselineLines.map((line) => ({
            kind: "insert_field_line",
            blockId: node.id as string,
            line,
            anchorFields: ["standard"]
          }))
        },
        category: "inheritance"
      })
    : null;

const buildAttemptResultSuggestions = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  blockId: string | undefined
): AuthoringSuggestion[] => {
  const variation = semanticLayer.condition_variations.find((item) => item.original_id === blockId);
  if (!blockId || !variation) {
    return [];
  }

  return semanticLayer.condition_variation_attempts
    .filter((attempt) => attempt.parent_condition_variation_id === variation.entity_id)
    .flatMap((attempt) => createAttemptResultSuggestion(semanticLayer, blockId, attempt));
};

const createAttemptResultSuggestion = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  blockId: string,
  attempt: ChemdTrainingExportV2["semantic_layer"]["condition_variation_attempts"][number]
): AuthoringSuggestion[] => {
  if (attempt.result_ref_raw || !attempt.reaction_ref_raw) {
    return [];
  }

  const attemptReactionRef = normalizeRef(attempt.reaction_ref_raw);
  const matches = semanticLayer.results.filter((result) =>
    normalizeRef(result.ref_raw ?? result.reaction_ref_raw) === attemptReactionRef
  );
  const resultId = matches.length === 1 ? matches[0]?.original_id : undefined;

  return resultId
    ? [createSuggestion({
        suggestion_id: `suggest-condition-result-${attempt.original_id}`,
        title: `为 ${attempt.original_id} 绑定结果`,
        description: "该尝试的 reaction 已唯一匹配到一个 result，可补 result。",
        target_block_id: blockId,
        patch: {
          kind: "insert_field_line",
          blockId,
          line: `result: @${resultId}`,
          anchorFields: ["attempt"]
        }
      })].filter((value): value is AuthoringSuggestion => Boolean(value))
    : [];
};

export const buildAuthoringAssistance = (
  document: ChemdDocument,
  trainingExport: ChemdTrainingExportV2
): AuthoringAssistance => {
  const semanticLayer = trainingExport.semantic_layer;
  const suggestions = [
    ...buildPrimaryMetaSuggestions(document, semanticLayer),
    ...buildRefSuggestions(document, semanticLayer),
    ...buildResultProductSuggestions(semanticLayer),
    ...buildConditionVariationSuggestions(document, semanticLayer)
  ];

  return {
    minimal_sets: buildAuthoringMinimalSets(document, semanticLayer, suggestions),
    templates: buildAuthoringTemplates(document, semanticLayer),
    suggestions
  };
};
