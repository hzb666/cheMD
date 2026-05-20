import type { ChemdNode, MarkdownNode, ObjectNode } from "@chemd/core";

export interface TraversedNode {
  node: MarkdownNode | ObjectNode;
  nodeIndex: number;
}

const isExportableNode = (node: ChemdNode): node is MarkdownNode | ObjectNode =>
  node.type === "markdown"
  || ["molecule", "material", "batch", "reaction", "result", "analysis", "sample", "artifact", "condition_varies"].includes(node.type);

export const collectExportableNodes = (children: ChemdNode[]): TraversedNode[] => {
  const traversed: TraversedNode[] = [];
  let nextIndex = 0;

  const visit = (node: ChemdNode) => {
    if (node.type === "col") {
      for (const child of node.children) {
        visit(child);
      }
      return;
    }

    if (!isExportableNode(node)) {
      return;
    }

    traversed.push({
      node,
      nodeIndex: nextIndex
    });
    nextIndex += 1;
  };

  for (const child of children) {
    visit(child);
  }

  return traversed;
};
