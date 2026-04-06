import { ensureBlockId } from "./ensure-block-id";

const MOLECULE_OPEN_RE = /^:::molecule(?:\s+#([^\s]+))?/;
const MOLECULE_CLOSE_RE = /^:::$/;
const SMILES_RE = /^\s*smiles\s*:/i;

export const updateMoleculeBlock = (source: string, blockId: string, smiles: string): string => {
  const lines = source.split(/\r?\n/);
  const targetOpen = `:::molecule #${blockId}`;
  let moleculeOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const openMatch = openLine.match(MOLECULE_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    moleculeOrdinal += 1;
    const existingId = ensureBlockId(openMatch[1], "mol", moleculeOrdinal);
    if (existingId !== blockId) {
      continue;
    }

    lines[index] = targetOpen;

    let endLine = index;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (MOLECULE_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    for (let scan = index + 1; scan < endLine; scan += 1) {
      if (SMILES_RE.test(lines[scan] ?? "")) {
        lines[scan] = `smiles: ${smiles}`;
        return lines.join("\n");
      }
    }

    lines.splice(endLine, 0, `smiles: ${smiles}`);
    return lines.join("\n");
  }

  return source;
};
