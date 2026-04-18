import { ensureBlockId } from "./ensure-block-id";

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
const MOLECULE_CLOSE_RE = /^:::$/;
const SMILES_RE = /^\s*smiles\s*:/i;
const KIND_RE = /^\s*kind\s*:/i;

const ensureKindLine = (lines: string[], startLine: number, endLine: number): number => {
  for (let scan = startLine + 1; scan < endLine; scan += 1) {
    if (KIND_RE.test(lines[scan] ?? "")) {
      lines[scan] = "kind: molecule";
      return endLine;
    }
  }

  lines.splice(startLine + 1, 0, "kind: molecule");
  return endLine + 1;
};

export const updateMoleculeBlock = (source: string, blockId: string, smiles: string): string => {
  const lines = source.split(/\r?\n/);
  const targetOpen = `:::chemd #${blockId}`;
  let chemdOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const chemdMatch = openLine.match(CHEMD_OPEN_RE);
    if (!chemdMatch) {
      continue;
    }

    const existingId = ensureBlockId(chemdMatch[1], "chem", ++chemdOrdinal);
    if (existingId !== blockId) {
      continue;
    }

    lines[index] = targetOpen;

    let endLine = lines.length;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (MOLECULE_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    const nextEndLine = ensureKindLine(lines, index, endLine);

    for (let scan = index + 1; scan < nextEndLine; scan += 1) {
      if (SMILES_RE.test(lines[scan] ?? "")) {
        lines[scan] = `smiles: ${smiles}`;
        return lines.join("\n");
      }
    }

    lines.splice(nextEndLine, 0, `smiles: ${smiles}`);
    return lines.join("\n");
  }

  return source;
};
