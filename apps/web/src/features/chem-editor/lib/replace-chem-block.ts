import type { ChemEditorDraft } from "../types";
import {
  findChemProgramDeclaration,
  pickPreservedLines,
  quoteProgramString,
  replaceChemProgramDeclaration,
  serializeProgramStringList
} from "./program-declaration";

const MOLECULE_METADATA_KEYS = new Set([
  "name",
  "role",
  "caption",
  "formula",
  "amount",
  "equivalents"
]);
const REACTION_METADATA_KEYS = new Set([
  "name",
  "caption",
  "reagents",
  "catalyst",
  "solvent",
  "temperature",
  "time",
  "pressure",
  "atmosphere",
  "yield",
  "conversion",
  "selectivity"
]);

const serializeChemBlock = (blockId: string, draft: ChemEditorDraft, existingLines: string[]): string[] => {
  if (draft.kind === "reaction") {
    const preservedLines = pickPreservedLines(existingLines, REACTION_METADATA_KEYS);
    const lines = [
      `reaction ${blockId} {`,
      `  reactants: ${serializeProgramStringList(draft.reactants)}`,
      `  products: ${serializeProgramStringList(draft.products)}`
    ];

    if (draft.conditions.length > 0) {
      lines.push(`  conditions: ${serializeProgramStringList(draft.conditions)}`);
    }

    lines.push(...preservedLines);
    lines.push("}");
    return lines;
  }

  return [
    `molecule ${blockId} {`,
    `  smiles: ${quoteProgramString(draft.smiles)}`,
    ...pickPreservedLines(existingLines, MOLECULE_METADATA_KEYS),
    "}"
  ];
};

export const replaceChemBlock = (
  source: string,
  blockId: string,
  draft: ChemEditorDraft
): string | null => {
  const declaration = findChemProgramDeclaration(source, blockId);
  if (!declaration) return null;
  return replaceChemProgramDeclaration(
    source,
    declaration,
    serializeChemBlock(blockId, draft, declaration.bodyLines)
  );
};
