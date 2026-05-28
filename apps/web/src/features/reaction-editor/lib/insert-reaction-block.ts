import type { ReactionEditorDraft } from "../types";

import { serializeProgramStringList } from "../../chem-editor/lib/program-declaration";

export const insertReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const trimmed = source.trimEnd();
  const lines = [
    `reaction ${blockId} {`,
    `  reactants: ${serializeProgramStringList(draft.reactants)}`,
    `  products: ${serializeProgramStringList(draft.products)}`
  ];

  if (draft.conditions.length > 0) {
    lines.push(`  conditions: ${serializeProgramStringList(draft.conditions)}`);
  }

  lines.push("}");
  const segment = lines.join("\n");

  return trimmed.length === 0 ? segment : `${trimmed}\n\n${segment}\n`;
};
