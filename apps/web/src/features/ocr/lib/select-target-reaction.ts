import { ensureBlockId } from "./ensure-block-id";

export interface ReactionTarget {
  blockId: string;
}

const REACTION_OPEN_RE = /^:::reaction(?:\s+#([^\s]+))?/;
const REACTION_CLOSE_RE = /^:::$/;

export const selectTargetReaction = (
  source: string,
  preferredBlockId?: string
): ReactionTarget | null => {
  const lines = source.split(/\r?\n/);
  const candidates: ReactionTarget[] = [];
  let reactionOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const openMatch = line.match(REACTION_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    reactionOrdinal += 1;
    candidates.push({ blockId: ensureBlockId(openMatch[1], "rxn", reactionOrdinal) });

    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (REACTION_CLOSE_RE.test(lines[scan] ?? "")) {
        index = scan;
        break;
      }
    }
  }

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
