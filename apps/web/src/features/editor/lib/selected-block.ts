/**
 * Utilities for locating the molecule block that the user's cursor is inside.
 *
 * Given a source text and a 0-based cursor line number, returns the innermost
 * `:::molecule` block containing that line (if any).
 */

export interface SelectedBlock {
  blockId: string;
  lineStart: number;
  lineEnd: number;
  smiles?: string;
}

/**
 * Find the molecule block that contains `cursorLine`.
 *
 * @param source     - Raw chemd source text.
 * @param cursorLine - 0-based line number of the cursor.
 * @returns The containing `SelectedBlock`, or `null` if the cursor is outside
 *   any molecule block.
 */
export const getSelectedBlock = (source: string, cursorLine: number): SelectedBlock | null => {
  const lines = source.split(/\r?\n/);

  let inBlock = false;
  let blockId = "";
  let lineStart = -1;
  let blockSmiles: string | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (!inBlock) {
      const openMatch = /^:::molecule(?:\s+#(\S+))?/.exec(line);
      if (openMatch) {
        inBlock = true;
        blockId = openMatch[1] ?? "";
        lineStart = i;
        blockSmiles = undefined;
      }
    } else {
      const smilesMatch = /^\s*smiles\s*:\s*(.+)/.exec(line);
      if (smilesMatch) {
        blockSmiles = smilesMatch[1]?.trim();
      }
      if (/^:::$/.test(line)) {
        if (cursorLine >= lineStart && cursorLine <= i) {
          return { blockId, lineStart, lineEnd: i, smiles: blockSmiles };
        }
        inBlock = false;
      }
    }
  }

  return null;
};
