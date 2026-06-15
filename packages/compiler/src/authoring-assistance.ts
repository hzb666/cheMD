import type { ChemdProgramDocument } from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import {
  collectObjectDeclarations,
  readDeclarationField,
  type AuthoringDeclaration
} from "./authoring-document";
import { buildAuthoringMinimalSets } from "./authoring-minimal-sets";
import { buildAuthoringTemplates } from "./authoring-templates";
import type {
  AuthoringAssistance,
  AuthoringSuggestion
} from "./authoring-types";

const CONDITION_FIELDS = ["solvent", "temperature", "catalyst", "time", "atmosphere"] as const;

const hasMetaValue = (document: ChemdProgramDocument, field: string): boolean => {
  if (field === "primary_reaction") return Boolean(document.meta.primary?.reaction);
  if (field === "primary_result") return Boolean(document.meta.primary?.result);
  const value = document.meta.fields[field];
  return typeof value?.raw === "string" && value.raw.trim().length > 0;
};

const normalizeRef = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^@/, "") : undefined;
};

const createSuggestion = (input: {
  suggestion_id: string;
  title: string;
  description: string;
  target_declaration_id?: string;
  target_field?: string;
  patch: AuthoringSuggestion["patch"];
  category?: AuthoringSuggestion["category"];
}
): AuthoringSuggestion | null =>
  input.target_declaration_id
    ? {
        suggestion_id: input.suggestion_id,
        title: input.title,
        description: input.description,
        category: input.category ?? "reference",
        confidence: "high",
        target: input.target_field
          ? {
              kind: "declaration_field",
              declarationId: input.target_declaration_id,
              field: input.target_field
            }
          : { kind: "declaration", declarationId: input.target_declaration_id },
        patch: input.patch
      }
    : null;

const createDocumentSuggestion = (input: {
  suggestion_id: string;
  title: string;
  description: string;
  document_id: string;
  field: string;
  line: string;
  anchorFields?: string[];
}): AuthoringSuggestion => ({
  suggestion_id: input.suggestion_id,
  title: input.title,
  description: input.description,
  category: "structure",
  confidence: "high",
  target: { kind: "meta_field", field: input.field },
  patch: {
    kind: "insert_meta_field",
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

const getDocumentPrimaryReactionId = (document: ChemdProgramDocument): string | undefined =>
  document.meta.primary?.reaction?.target;

const getReactionOriginalIds = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): string[] =>
  semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

const buildPrimaryMetaSuggestions = (
  document: ChemdProgramDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const documentId = document.meta.id.trim() || "document";
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const resultIds = semanticLayer.results
    .map((result) => result.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;
  const uniqueResultId = resultIds.length === 1 ? resultIds[0] : undefined;
  const primaryResultId = document.meta.primary?.result?.target ?? uniqueResultId;
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
          field: "primary_reaction",
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
          field: "primary_result",
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
      target_declaration_id: result.original_id,
      target_field: "product",
      patch: {
        kind: "insert_declaration_field",
        declarationId: result.original_id,
        line: `product: ${product.raw}`,
        anchorFields: ["status", "reaction", "ref"]
      },
      category: "reference"
    })].filter((value): value is AuthoringSuggestion => Boolean(value));
  });

const buildResultRefSuggestions = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;

  return semanticLayer.results.flatMap((result) => {
    if (result.ref_raw || result.reaction_ref_raw || !result.original_id) {
      return [];
    }

    const inferredReactionId = inferResultReactionId(semanticLayer, result) ?? uniqueReactionId;

    const suggestion = inferredReactionId
      ? createSuggestion({
          suggestion_id: `suggest-result-ref-${result.original_id}`,
          title: `为 ${result.original_id} 补 ref`,
          description: "当前 result 可唯一匹配 reaction，可保守补上 result.ref。",
          target_declaration_id: result.original_id,
          target_field: "ref",
          patch: {
            kind: "insert_declaration_field",
            declarationId: result.original_id,
            line: `ref: ${inferredReactionId}`
          }
        })
      : null;

    return suggestion ? [suggestion] : [];
  });
};

const createRefSuggestion = (
  declarationId: string,
  typeLabel: "procedure" | "observation",
  targetRef: string,
  description: string
): AuthoringSuggestion | null =>
  createSuggestion({
    suggestion_id: `suggest-${typeLabel}-ref-${declarationId}`,
    title: `为 ${declarationId} 补 ref`,
    description,
    target_declaration_id: declarationId,
    target_field: "ref",
    patch: {
      kind: "insert_declaration_field",
      declarationId,
      line: `ref: ${targetRef}`
    }
  });

const createAnalysisRefSuggestion = (
  node: AuthoringDeclaration,
  targetRef: string | undefined,
  uniqueAttemptRef: string | undefined
): AuthoringSuggestion[] =>
  targetRef
    ? [createSuggestion({
        suggestion_id: `suggest-analysis-ref-${node.id}`,
        title: `为 ${node.id} 补 ref`,
        description: uniqueAttemptRef
          ? "当前文档只有一个 condition_screen attempt，可保守补上 analysis.ref。"
          : "当前文档只有一个 reaction，可保守补上 analysis.ref。",
        target_declaration_id: node.id,
        target_field: "ref",
        patch: {
          kind: "insert_declaration_field",
          declarationId: node.id,
          line: `ref: ${targetRef}`,
          anchorFields: ["type"]
        }
      })].filter((value): value is AuthoringSuggestion => Boolean(value))
    : [];

const buildSupportingRefSuggestions = (
  document: ChemdProgramDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const uniqueAttemptId = semanticLayer.condition_variation_attempts.length === 1
    ? semanticLayer.condition_variation_attempts[0]?.original_id
    : undefined;
  const uniqueAttemptRef = uniqueAttemptId ? `@${uniqueAttemptId}` : undefined;
  const reactionIds = getReactionOriginalIds(semanticLayer);
  const uniqueReactionId = reactionIds.length === 1 ? reactionIds[0] : undefined;
  const defaultRefDescription = "当前文档只有一个 reaction，可保守补上记录 ref。";

  return collectObjectDeclarations(document).flatMap((node) => {
    if (node.ref) return [];
    if (node.kind === "analysis") {
      return createAnalysisRefSuggestion(node, uniqueAttemptRef ?? uniqueReactionId, uniqueAttemptRef);
    }
    if (node.kind === "procedure") {
      return uniqueReactionId ? [createRefSuggestion(node.id, "procedure", uniqueReactionId, defaultRefDescription)] : [];
    }
    if (node.kind === "observation") {
      const targetRef = uniqueAttemptRef ?? uniqueReactionId;
      return targetRef ? [createRefSuggestion(node.id, "observation", targetRef, defaultRefDescription)] : [];
    }
    return [];
  }).filter((value): value is AuthoringSuggestion => Boolean(value));
};

const buildRefSuggestions = (
  document: ChemdProgramDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  return [
    ...buildResultRefSuggestions(semanticLayer),
    ...buildSupportingRefSuggestions(document, semanticLayer)
  ];
};

const buildConditionVariationSuggestions = (
  document: ChemdProgramDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringSuggestion[] => {
  const explicitPrimaryReactionId = getDocumentPrimaryReactionId(document);
  const reactionIds = getReactionOriginalIds(semanticLayer);
  const variationNodes = collectObjectDeclarations(document)
    .filter((node) => node.kind === "condition_screen");

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
  node: AuthoringDeclaration;
  reactionIds: string[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
}): AuthoringSuggestion[] => {
  const declarationId = input.node.id;
  const inferredStandardId = inferConditionStandardId(input);
  const baselineLines = buildReactionBaselineLines(
    input.semanticLayer,
    readDeclarationField(input.node, "standard")
  );

  return [
    createConditionStandardSuggestion(input.node, inferredStandardId),
    createConditionBaselineSuggestion(input.node, baselineLines),
    ...buildAttemptResultSuggestions(input.semanticLayer, declarationId)
  ].filter((value): value is AuthoringSuggestion => Boolean(value));
};

const inferConditionStandardId = (input: {
  explicitPrimaryReactionId?: string;
  node: AuthoringDeclaration;
  reactionIds: string[];
}): string | undefined => {
  const attemptReactionIds = new Set(input.node.fields.reaction ? [
    normalizeRef(readDeclarationField(input.node, "reaction"))
  ].filter((value): value is string => Boolean(value)) : []);
  const unusedReactionIds = input.reactionIds.filter((reactionId) => !attemptReactionIds.has(reactionId));

  return input.explicitPrimaryReactionId
    ?? (input.reactionIds.length === 1 ? input.reactionIds[0] : undefined)
    ?? (unusedReactionIds.length === 1 ? unusedReactionIds[0] : undefined);
};

const createConditionStandardSuggestion = (
  node: AuthoringDeclaration,
  inferredStandardId: string | undefined
): AuthoringSuggestion | null =>
  !readDeclarationField(node, "standard") && inferredStandardId && node.id
    ? createSuggestion({
        suggestion_id: `suggest-condition-standard-${node.id}`,
        title: `为 ${node.id} 补 standard`,
        description: "当前文档有唯一可判定的 baseline reaction，可作为 standard。",
        target_declaration_id: node.id,
        target_field: "standard",
        patch: {
          kind: "insert_declaration_field",
          declarationId: node.id,
          line: `standard: @${inferredStandardId}`
        },
        category: "inheritance"
      })
    : null;

const createConditionBaselineSuggestion = (
  node: AuthoringDeclaration,
  baselineLines: string[]
): AuthoringSuggestion | null =>
  !readDeclarationField(node, "factor") && baselineLines.length > 0 && node.id
    ? createSuggestion({
        suggestion_id: `suggest-condition-baseline-${node.id}`,
        title: `为 ${node.id} 补 factor baseline`,
        description: "从 standard reaction 的已写条件生成 factor baseline 声明。",
        target_declaration_id: node.id,
        target_field: "factor",
        patch: {
          kind: "batch",
          patches: baselineLines.map((line) => ({
            kind: "insert_declaration_field",
            declarationId: node.id,
            line,
            anchorFields: ["standard"]
          }))
        },
        category: "inheritance"
      })
    : null;

const buildAttemptResultSuggestions = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  declarationId: string | undefined
): AuthoringSuggestion[] => {
  const variation = semanticLayer.condition_variations.find((item) => item.original_id === declarationId);
  if (!declarationId || !variation) {
    return [];
  }

  return semanticLayer.condition_variation_attempts
    .filter((attempt) => attempt.parent_condition_variation_id === variation.entity_id)
    .flatMap((attempt) => createAttemptResultSuggestion(semanticLayer, declarationId, attempt));
};

const createAttemptResultSuggestion = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  declarationId: string,
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
        target_declaration_id: declarationId,
        target_field: "result",
        patch: {
          kind: "insert_declaration_field",
          declarationId,
          line: `result: @${resultId}`,
          anchorFields: ["attempt"]
        }
      })].filter((value): value is AuthoringSuggestion => Boolean(value))
    : [];
};

export const buildAuthoringAssistance = (
  document: ChemdProgramDocument,
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
