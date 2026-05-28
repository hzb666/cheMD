import {
  findChemProgramDeclaration,
  pickPreservedLines,
  quoteProgramString,
  replaceChemProgramDeclaration
} from "../../chem-editor/lib/program-declaration";

const MOLECULE_METADATA_KEYS = new Set([
  "name",
  "role",
  "caption",
  "formula",
  "amount",
  "equivalents"
]);

export const updateMoleculeBlock = (source: string, blockId: string, smiles: string): string => {
  const declaration = findChemProgramDeclaration(source, blockId, "molecule");
  if (!declaration) return source;

  return replaceChemProgramDeclaration(source, declaration, [
    `molecule ${blockId} {`,
    `  smiles: ${quoteProgramString(smiles)}`,
    ...pickPreservedLines(declaration.bodyLines, MOLECULE_METADATA_KEYS),
    "}"
  ]);
};
