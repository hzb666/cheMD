import type {
  ChemdNode,
  ObjectNode
} from "@chemd/core";

export const collectObjectNodes = (nodes: ChemdNode[]): ObjectNode[] =>
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

export const collectNodeIds = (nodes: ChemdNode[]): string[] =>
  collectObjectNodes(nodes).flatMap((node) =>
    typeof node.id === "string" && node.id ? [node.id] : []
  );

export const findLastObjectNodeId = (
  nodes: ObjectNode[],
  candidateIds: string[]
): string | undefined => {
  const wanted = new Set(candidateIds.filter(Boolean));
  let lastId: string | undefined;

  for (const node of nodes) {
    if (node.id && wanted.has(node.id)) {
      lastId = node.id;
    }
  }

  return lastId;
};
