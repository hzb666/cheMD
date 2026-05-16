import type { WorkspaceFileEntry } from "../../contracts";

export type WorkspaceTreeNode = {
  id: string;
  name: string;
  path: string;
  entry: WorkspaceFileEntry | null;
  children: WorkspaceTreeNode[];
};

const createTreeNode = (
  path: string,
  name: string,
  entry: WorkspaceFileEntry | null = null,
): WorkspaceTreeNode => ({
  id: entry?.id ?? `folder:${path || "root"}`,
  name,
  path,
  entry,
  children: [],
});

const splitWorkspacePath = (path: string): string[] =>
  path.replace(/\\/g, "/").split("/").filter(Boolean);

export const buildWorkspaceTree = (files: readonly WorkspaceFileEntry[]): WorkspaceTreeNode[] => {
  const root = createTreeNode("", "");
  const nodes = new Map<string, WorkspaceTreeNode>([["", root]]);

  for (const entry of files) {
    const segments = splitWorkspacePath(entry.path);
    let parent = root;
    let currentPath = "";

    segments.forEach((segment, index) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isLeaf = index === segments.length - 1;
      const existing = nodes.get(currentPath);
      if (existing) {
        if (isLeaf) existing.entry = entry;
        parent = existing;
        return;
      }

      const node = createTreeNode(currentPath, isLeaf ? entry.name : segment, isLeaf ? entry : null);
      nodes.set(currentPath, node);
      parent.children.push(node);
      parent = node;
    });
  }

  const sortNodes = (nodesToSort: WorkspaceTreeNode[]) => {
    nodesToSort.sort((left, right) => {
      const leftDirectory = left.entry?.kind !== "file";
      const rightDirectory = right.entry?.kind !== "file";
      if (leftDirectory !== rightDirectory) return leftDirectory ? -1 : 1;
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    });
    nodesToSort.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root.children);
  return root.children;
};

export const getSelectedAncestorPaths = (
  nodes: readonly WorkspaceTreeNode[],
  selectedFileId: string,
  ancestors: string[] = [],
): Set<string> => {
  for (const node of nodes) {
    if (node.entry?.id === selectedFileId) {
      return new Set(ancestors);
    }
    const found = getSelectedAncestorPaths(node.children, selectedFileId, [...ancestors, node.path]);
    if (found.size > 0) return found;
  }
  return new Set();
};
