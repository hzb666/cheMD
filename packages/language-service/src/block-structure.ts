export interface ChemdBlockNode {
  blockType: string;
  children: ChemdBlockNode[];
  endLine: number;
  header: string;
  hasClosingFence: boolean;
  label: string;
  sourceStyle: "declaration" | "inline";
  startLine: number;
}

export interface ChemdFencePair {
  blockType: string;
  closeLine: number;
  label: string;
  openLine: number;
}

const declarationStartPattern =
  /^\s*([A-Za-z_][\w-]*)\s+([A-Za-z_][\w-]*)(?:\s+for\s+@[A-Za-z0-9_.#/-]+)?\s*\{\s*$/u;
const stepPattern = /^\s*step\s+([A-Za-z_][\w-]*)\s*=/u;

const buildDeclarationNode = (
  blockType: string,
  id: string,
  header: string,
  startLine: number
): ChemdBlockNode => ({
  blockType,
  children: [],
  endLine: startLine,
  header,
  hasClosingFence: false,
  label: `${blockType} ${id}`,
  sourceStyle: "declaration",
  startLine
});

const buildInlineNode = (
  blockType: string,
  id: string,
  header: string,
  startLine: number
): ChemdBlockNode => ({
  blockType,
  children: [],
  endLine: startLine,
  header,
  hasClosingFence: false,
  label: `${blockType} ${id}`,
  sourceStyle: "inline",
  startLine
});

const addNode = (
  roots: ChemdBlockNode[],
  stack: ChemdBlockNode[],
  node: ChemdBlockNode
): void => {
  const parent = stack.at(-1);
  if (parent) {
    parent.children.push(node);
  } else {
    roots.push(node);
  }
};

export const parseChemdBlockStructure = (source: string): ChemdBlockNode[] => {
  const lines = source.split(/\r\n|\r|\n/);
  const roots: ChemdBlockNode[] = [];
  const stack: ChemdBlockNode[] = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const declaration = line.match(declarationStartPattern);
    if (declaration) {
      const node = buildDeclarationNode(
        declaration[1] ?? "declaration",
        declaration[2] ?? "unknown",
        trimmed,
        lineNumber
      );
      addNode(roots, stack, node);
      stack.push(node);
      return;
    }

    const step = line.match(stepPattern);
    const parent = stack.at(-1);
    if (step && parent?.blockType === "procedure") {
      parent.children.push(buildInlineNode("step", step[1] ?? "unknown", trimmed, lineNumber));
      return;
    }

    if (trimmed === "}") {
      const node = stack.pop();
      if (node) {
        node.endLine = lineNumber;
        node.hasClosingFence = true;
      }
    }
  });

  const endLine = Math.max(lines.length, 1);
  for (const node of stack.reverse()) {
    node.endLine = endLine;
  }

  return roots;
};

export const findChemdBlockPathAtLine = (
  nodes: readonly ChemdBlockNode[],
  lineNumber: number
): ChemdBlockNode[] => {
  for (const node of nodes) {
    if (lineNumber < node.startLine || lineNumber > node.endLine) {
      continue;
    }

    return [node, ...findChemdBlockPathAtLine(node.children, lineNumber)];
  }

  return [];
};

export const flattenChemdBlockStructure = (
  nodes: readonly ChemdBlockNode[]
): ChemdBlockNode[] => nodes.flatMap((node) => [
  node,
  ...flattenChemdBlockStructure(node.children)
]);

export const findChemdFencePairAtLine = (
  nodes: readonly ChemdBlockNode[],
  lineNumber: number
): ChemdFencePair | undefined => {
  for (const node of nodes) {
    if (node.sourceStyle === "declaration" && node.hasClosingFence && (
      lineNumber === node.startLine || lineNumber === node.endLine
    )) {
      return {
        blockType: node.blockType,
        closeLine: node.endLine,
        label: node.label,
        openLine: node.startLine
      };
    }

    if (lineNumber >= node.startLine && lineNumber <= node.endLine) {
      const childPair = findChemdFencePairAtLine(node.children, lineNumber);
      if (childPair) return childPair;
    }
  }

  return undefined;
};
