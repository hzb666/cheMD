import type {
  ChemdDocument,
  ObjectNode
} from "@chemd/core";
import type {
  ChemdTrainingExportV2,
  ExportedConditionVariationAttemptV1,
  ExportedConditionVaryV1,
  ExportedReactionV1
} from "@chemd/exporter-training";

import {
  collectNodeIds,
  collectObjectNodes,
  findLastObjectNodeId
} from "./authoring-document";
import type {
  AuthoringPatch,
  AuthoringTemplate
} from "./authoring-types";

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

const readIdStem = (value: string, prefix: string): string => {
  const normalized = value.replace(new RegExp(`^${prefix}-?`), "");
  return normalized || "main";
};

const buildPatch = (patches: AuthoringPatch[]): AuthoringPatch =>
  patches.length === 1 ? patches[0] : { kind: "batch", patches };

const buildResultBlockText = (resultId: string, reactionId: string): string =>
  [
    `:::result #${resultId}`,
    `ref: ${reactionId}`,
    "status: success",
    "yield: 0 %",
    ":::"
  ].join("\n");

const buildAnalysisBlockText = (analysisId: string, ref: string): string =>
  [
    `:::analysis #${analysisId}`,
    "type: tlc",
    `ref: ${ref}`,
    "result: one major spot",
    ":::"
  ].join("\n");

const buildObservationBlockText = (observationId: string, ref: string): string =>
  [
    `:::observation #${observationId}`,
    `ref: ${ref}`,
    "Observation placeholder.",
    ":::"
  ].join("\n");

const collectSupportNodeIds = (
  nodes: ObjectNode[],
  type: "analysis" | "observation",
  ref: string
): string[] =>
  nodes.flatMap((node) =>
    node.type === type && node.id && node.ref === ref ? [node.id] : []
  );

const hasUnlinkedSupportNode = (
  nodes: ObjectNode[],
  type: "analysis" | "observation"
): boolean =>
  nodes.some((node) => node.type === type && Boolean(node.id) && !node.ref);

const hasUnlinkedResultNode = (nodes: ObjectNode[]): boolean =>
  nodes.some((node) => node.type === "result" && Boolean(node.id) && !node.ref && !node.reaction);

const readAnchorId = (
  nodes: ObjectNode[],
  fallbackId: string,
  candidateIds: string[]
): string =>
  findLastObjectNodeId(nodes, candidateIds) ?? fallbackId;

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

const findUniqueResultForReaction = (
  semanticLayer: ChemdTrainingExportV2["semantic_layer"],
  reactionId: string
): string | undefined => {
  const matches = semanticLayer.results.filter((result) =>
    (result.ref_raw ?? result.reaction_ref_raw) === reactionId
  );

  return matches.length === 1 ? matches[0]?.original_id : undefined;
};

const buildMissingSummary = (labels: string[]): string =>
  `补齐 ${labels.join(" / ")}，并自动写入最稳的引用。`;

const resolveSatisfied = (
  explicitMatch: boolean,
  canReuseUnlinkedBlocks: boolean,
  hasUnlinkedBlock: boolean
): boolean => explicitMatch || (canReuseUnlinkedBlocks && hasUnlinkedBlock);

const buildReactionMissingLabels = (input: {
  resultSatisfied: boolean;
  analysisSatisfied: boolean;
  observationSatisfied: boolean;
}): string[] => [
  ...(input.resultSatisfied ? [] : ["result"]),
  ...(input.analysisSatisfied ? [] : ["TLC"]),
  ...(input.observationSatisfied ? [] : ["observation"])
];

const buildAttemptMissingLabels = (input: {
  needsResultLink: boolean;
  needsResultBlock: boolean;
  analysisSatisfied: boolean;
  observationSatisfied: boolean;
}): string[] => [
  ...(input.needsResultLink ? ["res link"] : []),
  ...(input.needsResultBlock ? ["result"] : []),
  ...(input.analysisSatisfied ? [] : ["TLC"]),
  ...(input.observationSatisfied ? [] : ["observation"])
];

interface ReactionScaffoldState {
  existingResultId?: string;
  anchorIds: string[];
  missingLabels: string[];
  resultSatisfied: boolean;
  analysisSatisfied: boolean;
  observationSatisfied: boolean;
}

const buildReactionScaffoldState = (input: {
  reaction: ExportedReactionV1;
  objectNodes: ObjectNode[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
  canReuseUnlinkedBlocks: boolean;
}): ReactionScaffoldState => {
  const { reaction, objectNodes, semanticLayer, canReuseUnlinkedBlocks } = input;
  const existingResultId = findLinkedResultOriginalId(semanticLayer, reaction.entity_id);
  const analysisIds = collectSupportNodeIds(objectNodes, "analysis", reaction.original_id ?? "");
  const observationIds = collectSupportNodeIds(objectNodes, "observation", reaction.original_id ?? "");
  const resultSatisfied = resolveSatisfied(
    Boolean(existingResultId),
    canReuseUnlinkedBlocks,
    hasUnlinkedResultNode(objectNodes)
  );
  const analysisSatisfied = resolveSatisfied(
    analysisIds.length > 0,
    canReuseUnlinkedBlocks,
    hasUnlinkedSupportNode(objectNodes, "analysis")
  );
  const observationSatisfied = resolveSatisfied(
    observationIds.length > 0,
    canReuseUnlinkedBlocks,
    hasUnlinkedSupportNode(objectNodes, "observation")
  );

  return {
    existingResultId,
    anchorIds: [
      ...(reaction.original_id ? [reaction.original_id] : []),
      ...(existingResultId ? [existingResultId] : []),
      ...analysisIds,
      ...observationIds
    ],
    missingLabels: buildReactionMissingLabels({
      resultSatisfied,
      analysisSatisfied,
      observationSatisfied
    }),
    resultSatisfied,
    analysisSatisfied,
    observationSatisfied
  };
};

const appendReactionResultPatch = (input: {
  patches: AuthoringPatch[];
  anchorId: string;
  reactionId: string;
  stem: string;
  usedIds: Set<string>;
}): string => {
  const resultId = createUnusedId(`res-${input.stem}`, input.usedIds);
  input.usedIds.add(resultId);
  input.patches.push({
    kind: "insert_after_block",
    blockId: input.anchorId,
    text: buildResultBlockText(resultId, input.reactionId)
  });
  return resultId;
};

const appendSupportPatch = (input: {
  patches: AuthoringPatch[];
  anchorId: string;
  prefix: "ana" | "obs";
  stem: string;
  ref: string;
  usedIds: Set<string>;
}): string => {
  const blockId = createUnusedId(`${input.prefix}-${input.stem}`, input.usedIds);
  const text = input.prefix === "ana"
    ? buildAnalysisBlockText(blockId, input.ref)
    : buildObservationBlockText(blockId, input.ref);
  input.usedIds.add(blockId);
  input.patches.push({
    kind: "insert_after_block",
    blockId: input.anchorId,
    text
  });
  return blockId;
};

interface AttemptScaffoldState {
  existingResultId?: string;
  anchorIds: string[];
  missingLabels: string[];
  needsResultLink: boolean;
  needsResultBlock: boolean;
  analysisSatisfied: boolean;
  observationSatisfied: boolean;
}

const buildAttemptScaffoldState = (input: {
  variation: ExportedConditionVaryV1;
  attempt: ExportedConditionVariationAttemptV1;
  objectNodes: ObjectNode[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
  canReuseUnlinkedBlocks: boolean;
}): AttemptScaffoldState => {
  const { variation, attempt, objectNodes, semanticLayer, canReuseUnlinkedBlocks } = input;
  const attemptRef = attempt.original_id ? `@${attempt.original_id}` : "";
  const existingResultId = attempt.result_ref_raw
    ?? (attempt.reaction_ref_raw ? findUniqueResultForReaction(semanticLayer, attempt.reaction_ref_raw) : undefined);
  const analysisIds = collectSupportNodeIds(objectNodes, "analysis", attemptRef);
  const observationIds = collectSupportNodeIds(objectNodes, "observation", attemptRef);
  const needsResultLink = !attempt.result_ref_raw && Boolean(existingResultId);
  const needsResultBlock = !existingResultId && Boolean(attempt.reaction_ref_raw);
  const analysisSatisfied = resolveSatisfied(
    analysisIds.length > 0,
    canReuseUnlinkedBlocks,
    hasUnlinkedSupportNode(objectNodes, "analysis")
  );
  const observationSatisfied = resolveSatisfied(
    observationIds.length > 0,
    canReuseUnlinkedBlocks,
    hasUnlinkedSupportNode(objectNodes, "observation")
  );

  return {
    existingResultId,
    anchorIds: [
      ...(variation.original_id ? [variation.original_id] : []),
      ...(existingResultId ? [existingResultId] : []),
      ...analysisIds,
      ...observationIds
    ],
    missingLabels: buildAttemptMissingLabels({
      needsResultLink,
      needsResultBlock,
      analysisSatisfied,
      observationSatisfied
    }),
    needsResultLink,
    needsResultBlock,
    analysisSatisfied,
    observationSatisfied
  };
};

const buildReactionScaffoldTemplate = (input: {
  reaction: ExportedReactionV1;
  objectNodes: ObjectNode[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
  usedIds: Set<string>;
  canReuseUnlinkedBlocks: boolean;
}): AuthoringTemplate | null => {
  const { reaction, objectNodes, semanticLayer, usedIds, canReuseUnlinkedBlocks } = input;
  if (!reaction.original_id) {
    return null;
  }

  const state = buildReactionScaffoldState({
    reaction,
    objectNodes,
    semanticLayer,
    canReuseUnlinkedBlocks
  });

  if (state.missingLabels.length === 0) {
    return null;
  }

  let anchorId = readAnchorId(
    objectNodes,
    reaction.original_id,
    state.anchorIds
  );
  const patches: AuthoringPatch[] = [];
  const stem = readIdStem(reaction.original_id, "rxn");

  if (!state.resultSatisfied) {
    anchorId = appendReactionResultPatch({
      patches,
      anchorId,
      reactionId: reaction.original_id,
      stem,
      usedIds
    });
  }

  if (!state.analysisSatisfied) {
    anchorId = appendSupportPatch({
      patches,
      anchorId,
      prefix: "ana",
      stem,
      ref: reaction.original_id,
      usedIds
    });
  }

  if (!state.observationSatisfied) {
    appendSupportPatch({
      patches,
      anchorId,
      prefix: "obs",
      stem,
      ref: reaction.original_id,
      usedIds
    });
  }

  return {
    template_id: `scaffold-reaction-support-${reaction.original_id}`,
    title: `为 ${reaction.original_id} 插入记录 Scaffold`,
    description: buildMissingSummary(state.missingLabels),
    category: "scaffold",
    patch: buildPatch(patches)
  };
};

const buildAttemptResultLinkPatch = (
  variationId: string,
  attemptId: string,
  resultId: string
): AuthoringPatch => ({
  kind: "insert_field_line",
  blockId: variationId,
  line: `result: @${resultId}`,
  anchorFields: ["attempt"]
});

const buildAttemptScaffoldTemplate = (input: {
  variation: ExportedConditionVaryV1;
  attempt: ExportedConditionVariationAttemptV1;
  objectNodes: ObjectNode[];
  semanticLayer: ChemdTrainingExportV2["semantic_layer"];
  usedIds: Set<string>;
  canReuseUnlinkedBlocks: boolean;
}): AuthoringTemplate | null => {
  const { variation, attempt, objectNodes, semanticLayer, usedIds, canReuseUnlinkedBlocks } = input;
  if (!variation.original_id || !attempt.original_id) {
    return null;
  }

  const attemptRef = `@${attempt.original_id}`;
  const state = buildAttemptScaffoldState({
    variation,
    attempt,
    objectNodes,
    semanticLayer,
    canReuseUnlinkedBlocks
  });

  if (state.missingLabels.length === 0) {
    return null;
  }

  let resultId = state.existingResultId;
  let anchorId = readAnchorId(
    objectNodes,
    variation.original_id,
    state.anchorIds
  );
  const patches: AuthoringPatch[] = [];
  const stem = readIdStem(attempt.attempt_id, "var");

  if (!resultId && attempt.reaction_ref_raw) {
    resultId = createUnusedId(`res-${stem}`, usedIds);
    usedIds.add(resultId);
    patches.push(buildAttemptResultLinkPatch(variation.original_id, attempt.attempt_id, resultId));
    patches.push({
      kind: "insert_after_block",
      blockId: anchorId,
      text: buildResultBlockText(resultId, attempt.reaction_ref_raw)
    });
    anchorId = resultId;
  } else if (state.needsResultLink && resultId) {
    patches.push(buildAttemptResultLinkPatch(variation.original_id, attempt.attempt_id, resultId));
    anchorId = resultId;
  }

  if (!state.analysisSatisfied) {
    anchorId = appendSupportPatch({
      patches,
      anchorId,
      prefix: "ana",
      stem,
      ref: attemptRef,
      usedIds
    });
  }

  if (!state.observationSatisfied) {
    appendSupportPatch({
      patches,
      anchorId,
      prefix: "obs",
      stem,
      ref: attemptRef,
      usedIds
    });
  }

  return {
    template_id: `scaffold-condition-attempt-${attempt.original_id}`,
    title: `为 ${attempt.original_id} 插入 Attempt Scaffold`,
    description: `${buildMissingSummary(state.missingLabels)} analysis/observation 将指向 ${attemptRef}。`,
    category: "scaffold",
    patch: buildPatch(patches)
  };
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
        "yield: 0 %",
        ":::"
      ].join("\n")
    }
  };
};

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
        "factor: solvent | baseline=THF",
        "factor: temperature | baseline=25 C",
        "outcome: conversion | baseline=85 %",
        "attempt: var1",
        `reaction: ${fallbackCandidate}`,
        "result: @res-var1",
        "solvent: MeCN",
        "temperature: 40 C",
        "conversion: 90 %",
        "note: conversion improved",
        ":::"
      ].join("\n")
    }
  };
};

export const buildAuthoringTemplates = (
  document: ChemdDocument,
  semanticLayer: ChemdTrainingExportV2["semantic_layer"]
): AuthoringTemplate[] => {
  const usedIds = new Set(collectNodeIds(document.children));
  const objectNodes = collectObjectNodes(document.children);
  const reactionIds = semanticLayer.reactions
    .map((reaction) => reaction.original_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const canReuseUnlinkedReactionBlocks = reactionIds.length === 1;
  const canReuseUnlinkedAttemptBlocks = semanticLayer.condition_variation_attempts.length === 1;

  if (reactionIds.length === 0) {
    return [buildReactionResultStarter(usedIds)];
  }

  const attemptReactionIds = new Set(
    semanticLayer.condition_variation_attempts
      .map((attempt) => attempt.reaction_ref_raw)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );
  const reactionScaffolds = semanticLayer.reactions.flatMap((reaction) => {
    if (!reaction.original_id || attemptReactionIds.has(reaction.original_id)) {
      return [];
    }

    const template = buildReactionScaffoldTemplate({
      reaction,
      objectNodes,
      semanticLayer,
      usedIds,
      canReuseUnlinkedBlocks: canReuseUnlinkedReactionBlocks
    });
    return template ? [template] : [];
  });
  const attemptScaffolds = semanticLayer.condition_variation_attempts.flatMap((attempt) => {
    const variation = semanticLayer.condition_variations.find((item) =>
      item.entity_id === attempt.parent_condition_variation_id
    );
    if (!variation) {
      return [];
    }

    const template = buildAttemptScaffoldTemplate({
      variation,
      attempt,
      objectNodes,
      semanticLayer,
      usedIds,
      canReuseUnlinkedBlocks: canReuseUnlinkedAttemptBlocks
    });
    return template ? [template] : [];
  });
  const templates = [...reactionScaffolds, ...attemptScaffolds];

  if (reactionIds.length >= 2 || semanticLayer.condition_variations.length === 0) {
    templates.push(buildConditionScreenTemplate(reactionIds[0], reactionIds[1], usedIds));
  }

  return templates;
};
