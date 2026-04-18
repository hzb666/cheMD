import { ensureBlockId } from "./ensure-block-id";
import { readChemdBlockKind } from "./read-chemd-block-kind";

export interface ReactionTarget {
  blockId: string;
}

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
const REACTION_CLOSE_RE = /^:::$/;

export const selectTargetReaction = (
  source: string,
  preferredBlockId?: string
): ReactionTarget | null => {
  const lines = source.split(/\r?\n/);
  const candidates: ReactionTarget[] = [];
  let chemdOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const chemdMatch = line.match(CHEMD_OPEN_RE);
    if (!chemdMatch) {
      continue;
    }

    let endLine = lines.length;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (REACTION_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    const blockLines = lines.slice(index + 1, endLine);
    const blockId = ensureBlockId(chemdMatch[1], "chem", ++chemdOrdinal);
    const explicitKind = readChemdBlockKind(blockLines);
    if (explicitKind === "reaction") {
      candidates.push({ blockId });
    }
    index = endLine;
  }

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
