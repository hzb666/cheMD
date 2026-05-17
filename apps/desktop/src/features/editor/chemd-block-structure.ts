export interface ChemdBlockNode {
  blockType: string;
  children: ChemdBlockNode[];
  endLine: number;
  header: string;
  label: string;
  startLine: number;
}

const blockStartPattern = /^\s*:::\s*([a-z][\w-]*)(?:\s+(.*))?\s*$/i;
const inlineChildPattern = /^\s*(step|event):\s*(.+)$/i;

const readBlockLabel = (blockType: string, headerArg: string | undefined): string => {
  const trimmed = headerArg?.trim();
  if (!trimmed) return blockType;

  const [firstToken] = trimmed.split(/\s+/);
  if (!firstToken) return blockType;

  return `${blockType} ${firstToken.startsWith("#") ? firstToken.slice(1) : firstToken}`;
};

const readInlineDeclarationLabel = (blockType: string, body: string): string => {
  const segments = body.split("|").map((segment) => segment.trim()).filter(Boolean);
  const explicitId = segments
    .map((segment) => segment.match(/^id\s*=\s*([^\s|]+)/i)?.[1])
    .find(Boolean);
  const firstToken = segments[0]?.split(/\s+/)[0];
  const labelToken = explicitId ?? firstToken;

  return labelToken ? `${blockType} ${labelToken}` : blockType;
};

const buildNode = (
  blockType: string,
  headerArg: string | undefined,
  header: string,
  startLine: number,
): ChemdBlockNode => ({
  blockType,
  children: [],
  endLine: startLine,
  header,
  label: readBlockLabel(blockType, headerArg),
  startLine,
});

const buildInlineChildNode = (
  blockType: string,
  body: string,
  header: string,
  startLine: number,
): ChemdBlockNode => ({
  blockType,
  children: [],
  endLine: startLine,
  header,
  label: readInlineDeclarationLabel(blockType, body),
  startLine,
});

const pushNode = (
  roots: ChemdBlockNode[],
  stack: ChemdBlockNode[],
  node: ChemdBlockNode,
) => {
  const parent = stack.at(-1);
  if (parent) {
    parent.children.push(node);
  } else {
    roots.push(node);
  }
  stack.push(node);
};

const closeInlineChild = (
  inlineChildrenByParent: Map<ChemdBlockNode, ChemdBlockNode>,
  parent: ChemdBlockNode,
  endLine: number,
) => {
  const child = inlineChildrenByParent.get(parent);
  if (!child) return;

  child.endLine = Math.max(child.startLine, endLine);
  inlineChildrenByParent.delete(parent);
};

export const parseChemdBlockStructure = (source: string): ChemdBlockNode[] => {
  const lines = source.split(/\r\n|\r|\n/);
  const roots: ChemdBlockNode[] = [];
  const stack: ChemdBlockNode[] = [];
  const inlineChildrenByParent = new Map<ChemdBlockNode, ChemdBlockNode>();

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const startMatch = line.match(blockStartPattern);
    const parent = stack.at(-1);

    if (startMatch) {
      if (parent) {
        closeInlineChild(inlineChildrenByParent, parent, lineNumber - 1);
      }
      pushNode(
        roots,
        stack,
        buildNode(startMatch[1].toLowerCase(), startMatch[2], trimmed, lineNumber)
      );
      return;
    }

    if (trimmed === ":::") {
      const node = stack.pop();
      if (node) {
        closeInlineChild(inlineChildrenByParent, node, lineNumber - 1);
        node.endLine = lineNumber;
      }
      return;
    }

    const inlineMatch = line.match(inlineChildPattern);
    if (parent && inlineMatch) {
      closeInlineChild(inlineChildrenByParent, parent, lineNumber - 1);

      const node = buildInlineChildNode(
        inlineMatch[1].toLowerCase(),
        inlineMatch[2],
        trimmed,
        lineNumber,
      );
      parent.children.push(node);
      inlineChildrenByParent.set(parent, node);
    }
  });

  const endLine = Math.max(lines.length, 1);
  for (const node of [...stack].reverse()) {
    closeInlineChild(inlineChildrenByParent, node, endLine);
    node.endLine = endLine;
  }

  return roots;
};

export const findChemdBlockPathAtLine = (
  nodes: readonly ChemdBlockNode[],
  lineNumber: number,
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
  nodes: readonly ChemdBlockNode[],
): ChemdBlockNode[] => nodes.flatMap((node) => [
  node,
  ...flattenChemdBlockStructure(node.children),
]);
