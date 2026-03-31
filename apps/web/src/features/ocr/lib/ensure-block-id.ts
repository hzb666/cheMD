/**
 * Ensure a `:::molecule` block has a stable `#id` anchor.
 *
 * If the block already has an id this is a no-op. Otherwise a new id is
 * generated from the prefix + a timestamp, inserted into the opening line,
 * and the updated source is returned together with the resolved id.
 *
 * @param source    - Current chemd source text.
 * @param lineStart - 0-based line index of the opening `:::molecule` line.
 * @param prefix    - Id prefix (default: "mol").
 * @returns `{ source, blockId }` where `blockId` is the id that was assigned.
 */
export const ensureBlockId = (
  source: string,
  lineStart: number,
  prefix = "mol"
): { source: string; blockId: string } => {
  const lines = source.split(/\r?\n/);
  const openLine = lines[lineStart] ?? "";
  const existingId = /^:::molecule\s+#(\S+)/.exec(openLine)?.[1];

  if (existingId) {
    return { source, blockId: existingId };
  }

  const blockId = `${prefix}-${Date.now()}`;
  lines[lineStart] = `:::molecule #${blockId}`;
  return { source: lines.join("\n"), blockId };
};
