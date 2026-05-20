import type { ChemdNode } from "@chemd/core";

import type { ObjectNode } from "./types";

const OBJECT_TYPES = new Set([
  "molecule",
  "material",
  "batch",
  "reaction",
  "result",
  "analysis",
  "procedure",
  "observation",
  "sample",
  "artifact",
  "condition_varies"
]);

export const isObjectNode = (node: ChemdNode): node is ObjectNode =>
  OBJECT_TYPES.has(node.type);

export const collectNodes = (nodes: ChemdNode[]): ChemdNode[] => {
  const output: ChemdNode[] = [];

  for (const node of nodes) {
    output.push(node);

    if (node.type === "col") {
      output.push(...collectNodes(node.children));
    }

    if (node.type === "template") {
      output.push(...collectNodes(node.body));
    }
  }

  return output;
};
