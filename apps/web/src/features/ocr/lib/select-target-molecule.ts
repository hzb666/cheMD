import { ensureBlockId } from "./ensure-block-id";

const MOLECULE_OPEN_RE = /^:::molecule(?:\s+#([^\s]+))?/;
const MOLECULE_CLOSE_RE = /^:::$/;

export interface MoleculeTarget {
  blockId: string;
  startLine: number;
  endLine: number;
}

export const selectTargetMolecule = (source: string): MoleculeTarget | null => {
  const lines = source.split(/\r?\n/);
  let candidate: MoleculeTarget | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const openMatch = line.match(MOLECULE_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    const blockId = ensureBlockId(openMatch[1]);
    let endLine = index;

    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (MOLECULE_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    candidate = { blockId, startLine: index, endLine };
    index = endLine;
  }

  return candidate;
};
