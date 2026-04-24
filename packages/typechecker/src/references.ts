import {
  buildScopedReferenceId,
  parseReferenceId,
  stripReferencePrefix,
  type ReactionRouteContext,
  type ReferenceContext
} from "@chemd/core";

import type {
  ExternalTargetIndex,
  ObjectNode,
  ReferenceOrLiteral,
  ReferenceType
} from "./types";

const TARGET_KIND_BY_NODE_TYPE: Record<string, ReferenceType["targetKind"]> = {
  molecule: "molecule",
  reaction: "reaction",
  result: "result",
  analysis: "analysis",
  sample: "sample",
  artifact: "artifact",
  condition_varies: "condition_varies",
  template: "template"
};

const findConditionVariationAttempt = (
  refId: string,
  objectIndex: Map<string, ObjectNode>
): boolean => {
  const parsed = parseReferenceId(refId);
  const parentId = parsed?.baseObjectLookupKey ?? refId.split(".")[0];
  const attemptId = parsed?.childId ?? refId.split(".")[1];
  if (!parentId || !attemptId) {
    return false;
  }

  const parent = objectIndex.get(parentId);
  return parent?.type === "condition_varies"
    && parent.attempts?.some((attempt) => attempt.id === attemptId) === true;
};

export const createObjectIndex = (
  documentId: string,
  nodes: ObjectNode[]
): Map<string, ObjectNode> =>
  new Map(
    nodes
      .filter((node) => typeof node.id === "string" && node.id.length > 0)
      .flatMap((node) => {
        const id = node.id as string;
        return [
          [id, node] as const,
          [buildScopedReferenceId(documentId, id), node] as const
        ];
      })
  );

export const createExternalTargetIndex = (
  referenceContext?: ReferenceContext,
  reactionRouteContext?: ReactionRouteContext
): ExternalTargetIndex =>
  new Map(
    [
      ...(referenceContext?.externalTargets ?? []).map((target) => ({
        ...target,
        refId: stripReferencePrefix(target.refId)
      })),
      ...(reactionRouteContext?.externalReactions ?? []).map((target) => ({
        ...target,
        refId: stripReferencePrefix(target.refId),
        targetKind: "reaction" as const
      }))
    ]
      .filter((target) => target.refId.length > 0)
      .map((target) => [target.refId, target] as const)
  );

export const toReferenceOrLiteral = (
  raw: string,
  objectIndex: Map<string, ObjectNode>,
  externalTargetIndex?: ExternalTargetIndex
): ReferenceOrLiteral => {
  const refId = stripReferencePrefix(raw);
  const target = objectIndex.get(refId);
  const externalTarget = externalTargetIndex?.get(refId);
  const isAttempt = !target && findConditionVariationAttempt(refId, objectIndex);

  if (!raw.startsWith("@") && !target && !externalTarget) {
    return isAttempt
      ? {
          kind: "reference",
          refId,
          targetKind: "condition_variation_attempt",
          resolved: true
        }
      : { kind: "literal", raw };
  }

  return {
    kind: "reference",
    refId,
    targetKind: target
      ? TARGET_KIND_BY_NODE_TYPE[target.type] ?? "unknown"
      : externalTarget
        ? externalTarget.targetKind
      : isAttempt ? "condition_variation_attempt" : "unknown",
    resolved: Boolean(target) || Boolean(externalTarget) || isAttempt
  };
};
