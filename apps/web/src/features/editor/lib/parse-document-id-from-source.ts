const META_BLOCK_PATTERN = /\bmeta\s*\{([\s\S]*?)\}/u;
const META_ID_PATTERN = /^\s*id\s*:\s*(?:"([^"]+)"|'([^']+)'|([^\s\r\n}]+))/mu;

export const parseDocumentIdFromSource = (source: string): string => {
  const metaBlock = source.match(META_BLOCK_PATTERN)?.[1];
  const match = metaBlock?.match(META_ID_PATTERN);
  const id = match?.[1] ?? match?.[2] ?? match?.[3];

  return id?.trim() || "workspace-doc";
};
