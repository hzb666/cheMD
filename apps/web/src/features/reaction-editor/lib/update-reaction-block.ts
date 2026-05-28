import type { ReactionEditorDraft } from "../types";
import {
  findChemProgramDeclaration,
  pickPreservedLines,
  replaceChemProgramDeclaration,
  serializeProgramStringList
} from "../../chem-editor/lib/program-declaration";

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

export const updateReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const declaration = findChemProgramDeclaration(source, blockId, "reaction");
  if (!declaration) return source;

  const lines = [
    `reaction ${blockId} {`,
    `  reactants: ${serializeProgramStringList(draft.reactants)}`,
    `  products: ${serializeProgramStringList(draft.products)}`
  ];
  if (draft.conditions.length > 0) {
    lines.push(`  conditions: ${serializeProgramStringList(draft.conditions)}`);
  }
  lines.push(...pickPreservedLines(declaration.bodyLines, REACTION_METADATA_KEYS));
  lines.push("}");

  return replaceChemProgramDeclaration(source, declaration, lines);
};
