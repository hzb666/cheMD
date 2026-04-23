import type { ChemdDocument, ChemdNode } from "@chemd/core";
import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";

import type { AuthoringTemplate } from "./authoring-types";

const collectNodeIds = (nodes: ChemdNode[]): string[] =>
  nodes.flatMap((node) => {
    const nested = node.type === "col" && Array.isArray(node.children)
      ? collectNodeIds(node.children)
      : node.type === "template" && Array.isArray(node.body)
        ? collectNodeIds(node.body)
        : [];
    return "id" in node && typeof node.id === "string" && node.id
      ? [node.id, ...nested]
      : nested;
  });

const createUnusedId = (base: string, usedIds: Set<string>): string => {
  if (!usedIds.has(base)) {
    return base;
  }

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
};

const buildReactionResultStarter = (usedIds: Set<string>): AuthoringTemplate => {
  const reactionId = createUnusedId("rxn-main", usedIds);
  usedIds.add(reactionId);
  const resultId = createUnusedId("res-main", usedIds);

  return {
    template_id: "starter-reaction-result",
    title: "插入 Reaction + Result 模板",
    description: "从最小实验记录开始，包含一个 reaction 和一个 linked result。",
    category: "starter",
    patch: {
      kind: "append_document_text",
      text: [
        `:::chemd #${reactionId}`,
        "kind: reaction",
        "reactants: substrate",
        "products: product",
        "solvent: THF",
        ":::",
        "",
        `:::result #${resultId}`,
        `ref: ${reactionId}`,
        "status: success",
        "yield: 0%",
        ":::"
      ].join("\n")
    }
  };
};

const buildResultCompanion = (
  reactionId: string,
  usedIds: Set<string>
): AuthoringTemplate => ({
  template_id: `companion-result-${reactionId}`,
  title: `为 ${reactionId} 插入 Result`,
  description: "为当前 reaction 补一个最小 result 块。",
  category: "companion",
  patch: {
    kind: "insert_after_block",
    blockId: reactionId,
    text: [
      `:::result #${createUnusedId(`res-${reactionId.replace(/^rxn-?/, "") || "main"}`, usedIds)}`,
      `ref: ${reactionId}`,
      "status: success",
      "yield: 0%",
      ":::"
    ].join("\n")
  }
});

const buildAnalysisCompanion = (
  reactionId: string,
  afterBlockId: string,
  usedIds: Set<string>
): AuthoringTemplate => ({
  template_id: `companion-analysis-${reactionId}`,
  title: `为 ${reactionId} 插入 TLC`,
  description: "补一个最常见的 analysis 模板，并自动引用当前 reaction。",
  category: "companion",
  patch: {
    kind: "insert_after_block",
    blockId: afterBlockId,
    text: [
      `:::analysis #${createUnusedId(`ana-${reactionId.replace(/^rxn-?/, "") || "main"}`, usedIds)}`,
      "type: tlc",
      `ref: ${reactionId}`,
      "result: one major spot",
      ":::"
    ].join("\n")
  }
});

const buildConditionScreenTemplate = (
  standardId: string,
  candidateId: string | undefined,
  usedIds: Set<string>
): AuthoringTemplate => {
  const conditionId = createUnusedId("cv-screen", usedIds);
  const fallbackCandidate = candidateId ?? "rxn-var1";

  return {
    template_id: `optimization-condition-screen-${standardId}`,
    title: "插入 Condition Screen 模板",
    description: "为条件优化补一个 condition-varies 块，预填 standard 和一次尝试。",
    category: "optimization",
    patch: {
      kind: "append_document_text",
      text: [
        `:::condition-varies #${conditionId}`,
        `standard: ${standardId}`,
        "condition: solvent=THF | temperature=25 C",
        "varies: solvent | temperature",
        `var1: reaction=${fallbackCandidate} | solvent=MeCN | temperature=40 C`,
        "res1: res-var1",
        "note1: conversion improved",
        ":::"
      ].join("\n")
    }
  };
};

const findLinkedResultOriginalId = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  reactionEntityId: string
): string | undefined => {
  const relation = semanticLayer.links.find((item) =>
    item.relation_type === "result_describes_reaction"
    && item.to_entity_id === reactionEntityId
  );
  const result = semanticLayer.results.find((item) => item.entity_id === relation?.from_entity_id);
  return result?.original_id;
};

export const buildAuthoringTemplates = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringTemplate[] => {
  const usedIds = new Set(collectNodeIds(document.children));
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const templates: AuthoringTemplate[] = [];

  if (reactionIds.length === 0) {
    templates.push(buildReactionResultStarter(usedIds));
    return templates;
  }

  const firstReaction = semanticLayer.reactions.find((reaction) => reaction.original_id === reactionIds[0]);
  if (firstReaction?.original_id && !findLinkedResultOriginalId(semanticLayer, firstReaction.entity_id)) {
    templates.push(buildResultCompanion(firstReaction.original_id, usedIds));
  }

  if (
    firstReaction?.original_id
    && !semanticLayer.analyses.some((analysis) => analysis.ref_raw === firstReaction.original_id)
  ) {
    const afterBlockId = findLinkedResultOriginalId(semanticLayer, firstReaction.entity_id) ?? firstReaction.original_id;
    templates.push(buildAnalysisCompanion(firstReaction.original_id, afterBlockId, usedIds));
  }

  if (reactionIds.length >= 2 || semanticLayer.condition_variations.length === 0) {
    templates.push(buildConditionScreenTemplate(reactionIds[0], reactionIds[1], usedIds));
  }

  return templates;
};
