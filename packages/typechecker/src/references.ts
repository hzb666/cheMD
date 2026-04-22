import type { ObjectNode, ReferenceOrLiteral, ReferenceType } from "./types";

const TARGET_KIND_BY_NODE_TYPE: Record<string, ReferenceType["targetKind"]> = {
  molecule: "molecule",
  reaction: "reaction",
  result: "result",
  analysis: "analysis",
  sample: "sample",
  artifact: "artifact",
  template: "template"
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

  if (!raw.startsWith("@") && !target) {
    return { kind: "literal", raw };
  }

  return {
    kind: "reference",
    refId,
    targetKind: target ? TARGET_KIND_BY_NODE_TYPE[target.type] ?? "unknown" : "unknown",
    resolved: Boolean(target)
  };
};
