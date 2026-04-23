import type { ObjectNode, ReferenceOrLiteral, ReferenceType } from "./types";

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
  const [parentId, attemptId] = refId.split(".");
  if (!parentId || !attemptId) {
    return false;
  }

  const parent = objectIndex.get(parentId);
  return parent?.type === "condition_varies"
    && parent.attempts?.some((attempt) => attempt.id === attemptId) === true;
};

export const createObjectIndex = (nodes: ObjectNode[]): Map<string, ObjectNode> =>
  new Map(
    nodes
      .filter((node) => typeof node.id === "string" && node.id.length > 0)
      .map((node) => [node.id as string, node])
  );

export const toReferenceOrLiteral = (
  raw: string,
  objectIndex: Map<string, ObjectNode>
): ReferenceOrLiteral => {
  const refId = raw.startsWith("@") ? raw.slice(1).trim() : raw.trim();
  const target = objectIndex.get(refId);
  const isAttempt = !target && findConditionVariationAttempt(refId, objectIndex);

  if (!raw.startsWith("@") && !target) {
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
      : isAttempt ? "condition_variation_attempt" : "unknown",
    resolved: Boolean(target) || isAttempt
  };
};
