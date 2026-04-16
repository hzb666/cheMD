import { compileChemd } from "@chemd/compiler";
import type { ChemdNode } from "@chemd/core";

export interface TreeNode {
  id: string;
  kind:
    | "document"
    | "molecule"
    | "reaction"
    | "result"
    | "analysis"
    | "procedure"
    | "observation"
    | "sample";
}

const isTreeObjectNode = (
  node: ChemdNode
): node is Extract<
  ChemdNode,
  {
    type:
      | "molecule"
      | "reaction"
      | "result"
      | "analysis"
      | "procedure"
      | "observation"
      | "sample";
  }
> =>
  [
    "molecule",
    "reaction",
    "result",
    "analysis",
    "procedure",
    "observation",
    "sample"
  ].includes(node.type);

const collectTreeNodes = (children: ChemdNode[]): Array<TreeNode> => {
  const nodes: Array<TreeNode> = [];

  for (const child of children) {
    if (child.type === "col") {
      nodes.push(...collectTreeNodes(child.children));
      continue;
    }

    if (child.type === "template") {
      nodes.push(...collectTreeNodes(child.body));
      continue;
    }

    if (!isTreeObjectNode(child) || !child.id) {
      continue;
    }

    nodes.push({
      id: child.id,
      kind: child.type
    });
  }

  return nodes;
};

export const buildMockTreeFromSource = (source: string): TreeNode[] => {
  const document = compileChemd(source).document;
  const nodes: TreeNode[] = [
    {
      id: document.meta.id,
      kind: "document"
    }
  ];

  return [...nodes, ...collectTreeNodes(document.children)];
};
