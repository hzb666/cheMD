import { listChemProgramDeclarations } from "../../chem-editor/lib/program-declaration";

export interface ReactionTarget {
  blockId: string;
}

export const selectTargetReaction = (
  source: string,
  preferredBlockId?: string
): ReactionTarget | null => {
  const candidates = listChemProgramDeclarations(source, "reaction")
    .map(({ blockId }) => ({ blockId }));

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
