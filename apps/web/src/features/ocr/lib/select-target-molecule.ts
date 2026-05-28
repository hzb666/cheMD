import { listChemProgramDeclarations } from "../../chem-editor/lib/program-declaration";

export interface MoleculeTarget {
  blockId: string;
  startLine: number;
  endLine: number;
}

export const selectTargetMolecule = (
  source: string,
  preferredBlockId?: string
): MoleculeTarget | null => {
  const candidates = listChemProgramDeclarations(source, "molecule")
    .map(({ blockId, startLine, endLine }) => ({ blockId, startLine, endLine }));

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};
