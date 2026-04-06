import { ensureBlockId } from "./ensure-block-id";

const MOLECULE_OPEN_RE = /^:::molecule(?:\s+#([^\s]+))?/;
const MOLECULE_CLOSE_RE = /^:::$/;

export interface MoleculeTarget {
  blockId: string;
  startLine: number;
  endLine: number;
}

export const selectTargetMolecule = (
  source: string,
  preferredBlockId?: string
): MoleculeTarget | null => {
  const lines = source.split(/\r?\n/);
  const candidates: MoleculeTarget[] = [];
  let moleculeOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const openMatch = line.match(MOLECULE_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    moleculeOrdinal += 1;
    const blockId = ensureBlockId(openMatch[1], "mol", moleculeOrdinal);
    let endLine = index;

    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (MOLECULE_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    candidates.push({ blockId, startLine: index, endLine });
    index = endLine;
  }

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
