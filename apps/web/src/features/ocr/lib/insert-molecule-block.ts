/**
 * Insert a new `:::molecule` block at the end of the source document.
 *
 * @param source  - Current chemd source text.
 * @param smiles  - SMILES to embed.
 * @param blockId - Stable block id to assign (e.g. "mol-001").
 * @returns Updated source text.
 */
export const insertMoleculeBlock = (source: string, smiles: string, blockId: string): string => {
  const separator = source.endsWith("\n") ? "\n" : "\n\n";
  return `${source}${separator}:::molecule #${blockId}\nsmiles: ${smiles}\n:::\n`;
};
