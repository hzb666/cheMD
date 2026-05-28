import { quoteProgramString } from "../../chem-editor/lib/program-declaration";

export const insertMoleculeBlock = (source: string, blockId: string, smiles: string): string => {
  const trimmed = source.trimEnd();
  const segment = [
    `molecule ${blockId} {`,
    `  smiles: ${quoteProgramString(smiles)}`,
    "}"
  ].join("\n");
  return trimmed.length === 0 ? segment : `${trimmed}\n\n${segment}\n`;
};
