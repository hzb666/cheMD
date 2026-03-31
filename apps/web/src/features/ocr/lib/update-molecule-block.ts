import type { MoleculeBlockLocation } from "./select-target-molecule";

/**
 * Update (or add) the `smiles:` key inside an existing `:::molecule` block.
 *
 * @param source   - Current chemd source text.
 * @param location - Block location returned by `selectTargetMolecule`.
 * @param smiles   - New SMILES value.
 * @returns Updated source text.
 */
export const updateMoleculeBlock = (
  source: string,
  location: MoleculeBlockLocation,
  smiles: string
): string => {
  const lines = source.split(/\r?\n/);
  const { lineStart, lineEnd } = location;

  if (location.hasSmiles) {
    // Replace the existing smiles line
    for (let i = lineStart + 1; i < lineEnd; i++) {
      if (/^\s*smiles\s*:/.test(lines[i]!)) {
        lines[i] = `smiles: ${smiles}`;
        break;
      }
    }
  } else {
    // Insert a smiles line just before the closing :::
    lines.splice(lineEnd, 0, `smiles: ${smiles}`);
  }

  return lines.join("\n");
};
