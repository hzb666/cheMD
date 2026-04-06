import { ensureBlockId } from "../../ocr/lib/ensure-block-id";
import type { ChemEditorDraft } from "../types";

const MOLECULE_OPEN_RE = /^:::molecule(?:\s+#([^\s]+))?/;
const REACTION_OPEN_RE = /^:::reaction(?:\s+#([^\s]+))?/;
const BLOCK_CLOSE_RE = /^:::$/;

const serializeChemBlock = (blockId: string, draft: ChemEditorDraft): string => {
  if (draft.kind === "reaction") {
    const lines = [
      `:::reaction #${blockId}`,
      `reactants: ${draft.reactants.join(" | ")}`,
      `products: ${draft.products.join(" | ")}`
    ];

    if (draft.conditions.length > 0) {
      lines.push(`conditions: ${draft.conditions.join(" | ")}`);
    }

    lines.push(":::");
    return lines.join("\n");
  }

  return [
    `:::molecule #${blockId}`,
    `smiles: ${draft.smiles}`,
    ":::"
  ].join("\n");
};

export const replaceChemBlock = (
  source: string,
  blockId: string,
  draft: ChemEditorDraft
): string => {
  const lines = source.split(/\r?\n/);
  let moleculeOrdinal = 0;
  let reactionOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const moleculeMatch = openLine.match(MOLECULE_OPEN_RE);
    const reactionMatch = openLine.match(REACTION_OPEN_RE);

    let existingId: string | null = null;
    if (moleculeMatch) {
      moleculeOrdinal += 1;
      existingId = ensureBlockId(moleculeMatch[1], "mol", moleculeOrdinal);
    } else if (reactionMatch) {
      reactionOrdinal += 1;
      existingId = ensureBlockId(reactionMatch[1], "rxn", reactionOrdinal);
    }

    if (!existingId || existingId !== blockId) {
      continue;
    }

    let endLine = index;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (BLOCK_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    lines.splice(index, endLine - index + 1, ...serializeChemBlock(blockId, draft).split("\n"));
    return lines.join("\n");
  }

  return source;
};
