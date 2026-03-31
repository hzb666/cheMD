export interface TreeNode {
  id: string;
  kind: "document" | "reaction" | "result" | "molecule";
}

const BLOCK_ID_CAPTURE_GROUP = "([A-Za-z0-9_-]+)";
const BLOCK_KINDS: Array<Exclude<TreeNode["kind"], "document">> = ["reaction", "result", "molecule"];
const BLOCK_PATTERNS: Array<{ kind: TreeNode["kind"]; pattern: RegExp }> = BLOCK_KINDS.map((kind) => ({
  kind,
  pattern: new RegExp(`:::${kind}\\s+#${BLOCK_ID_CAPTURE_GROUP}`, "g")
}));

export const buildMockTreeFromSource = (source: string): TreeNode[] => {
  const idMatch = source.match(/^id:\s*(.+)$/m);
  const nodes: TreeNode[] = [
    {
      id: (idMatch?.[1] || "workspace-doc").trim(),
      kind: "document"
    }
  ];

  for (const { kind, pattern } of BLOCK_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const id = match[1].trim();
      if (!id) {
        continue;
      }
      nodes.push({ id, kind });
    }
  }

  return nodes;
};
