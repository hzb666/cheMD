import { ensureBlockId } from "./ensure-block-id";
import { readChemdBlockKind } from "./read-chemd-block-kind";

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
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
  let chemdOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const chemdMatch = line.match(CHEMD_OPEN_RE);
    if (!chemdMatch) {
      continue;
    }
    let endLine = lines.length;

    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (MOLECULE_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    const blockLines = lines.slice(index + 1, endLine);
    const blockId = ensureBlockId(chemdMatch[1], "chem", ++chemdOrdinal);
    const explicitKind = readChemdBlockKind(blockLines);
    if (explicitKind !== "molecule") {
      index = endLine;
      continue;
    }

    candidates.push({ blockId, startLine: index, endLine });
    index = endLine;
  }

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
