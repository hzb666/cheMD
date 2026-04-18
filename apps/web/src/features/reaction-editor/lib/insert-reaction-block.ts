import type { ReactionEditorDraft } from "../types";

const joinList = (values: string[]): string => values.join(" | ");

export const insertReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const trimmed = source.trimEnd();
  const lines = [
    `:::chemd #${blockId}`,
    "kind: reaction",
    `reac: ${joinList(draft.reactants)}`,
    `prod: ${joinList(draft.products)}`
  ];

  if (draft.conditions.length > 0) {
    lines.push(`conditions: ${joinList(draft.conditions)}`);
  }

  lines.push(":::");
  const segment = lines.join("\n");

  return trimmed.length === 0 ? segment : `${trimmed}\n\n${segment}\n`;
};
