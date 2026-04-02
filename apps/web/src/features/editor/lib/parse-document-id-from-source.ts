const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;
const FRONTMATTER_ID_PATTERN = /^id:\s*(.+)$/m;

export const parseDocumentIdFromSource = (source: string): string => {
  const frontmatter = source.match(FRONTMATTER_PATTERN)?.[1];
  const match = frontmatter?.match(FRONTMATTER_ID_PATTERN);

  return match?.[1]?.trim() || "workspace-doc";
};
