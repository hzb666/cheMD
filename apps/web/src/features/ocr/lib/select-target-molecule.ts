/**
 * Given the current chemd source text, find the first `molecule` block that
 * does not already have a `smiles:` key, or return the last `molecule` block
 * as a fallback. Returns `null` if no `molecule` blocks exist.
 *
 * The returned object contains:
 * - `blockId`    – value of the `#id` anchor if present (or empty string)
 * - `lineStart`  – 0-based line index of the opening `:::molecule` line
 * - `lineEnd`    – 0-based line index of the closing `:::` line
 */
export interface MoleculeBlockLocation {
  blockId: string;
  lineStart: number;
  lineEnd: number;
  hasSmiles: boolean;
}

export const selectTargetMolecule = (source: string): MoleculeBlockLocation | null => {
  const lines = source.split(/\r?\n/);
  const blocks: MoleculeBlockLocation[] = [];

  let inBlock = false;
  let blockIdValue = "";
  let lineStart = -1;
  let hasSmiles = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inBlock) {
      const openMatch = /^:::molecule(?:\s+#(\S+))?/.exec(line);
      if (openMatch) {
        inBlock = true;
        blockIdValue = openMatch[1] ?? "";
        lineStart = i;
        hasSmiles = false;
      }
    } else {
      if (/^\s*smiles\s*:/.test(line)) {
        hasSmiles = true;
      }
      if (/^:::$/.test(line)) {
        blocks.push({ blockId: blockIdValue, lineStart, lineEnd: i, hasSmiles });
        inBlock = false;
      }
    }
  }

  if (blocks.length === 0) {
    return null;
  }

  // Prefer a block without smiles
  const withoutSmiles = blocks.find((b) => !b.hasSmiles);
  return withoutSmiles ?? blocks[blocks.length - 1]!;
};
