import { ensureBlockId } from "../../ocr/lib/ensure-block-id";

import type { ReactionEditorDraft } from "../types";

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
const BLOCK_CLOSE_RE = /^:::$/;
const REACTANTS_RE = /^\s*(?:reac|reactant|reactants)\s*:/i;
const PRODUCTS_RE = /^\s*(?:prod|product|products)\s*:/i;
const CONDITIONS_RE = /^\s*conditions\s*:/i;

const joinList = (values: string[]): string => values.join(" | ");

export const updateReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const lines = source.split(/\r?\n/);
  const targetOpen = `:::chemd #${blockId}`;
  let chemdOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const chemdMatch = openLine.match(CHEMD_OPEN_RE);
    if (!chemdMatch) {
      continue;
    }

    const existingId = ensureBlockId(chemdMatch[1], "chem", ++chemdOrdinal);
    if (existingId !== blockId) {
      continue;
    }

    lines[index] = targetOpen;

    let endLine = lines.length;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (BLOCK_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    let reactantsLine = -1;
    let productsLine = -1;
    let conditionsLine = -1;

    for (let scan = index + 1; scan < endLine; scan += 1) {
      if (REACTANTS_RE.test(lines[scan] ?? "")) {
        reactantsLine = scan;
      } else if (PRODUCTS_RE.test(lines[scan] ?? "")) {
        productsLine = scan;
      } else if (CONDITIONS_RE.test(lines[scan] ?? "")) {
        conditionsLine = scan;
      }
    }

    if (reactantsLine >= 0) {
      lines[reactantsLine] = `reac: ${joinList(draft.reactants)}`;
    } else {
      lines.splice(endLine, 0, `reac: ${joinList(draft.reactants)}`);
      endLine += 1;
    }

    if (productsLine >= 0) {
      lines[productsLine] = `prod: ${joinList(draft.products)}`;
    } else {
      lines.splice(endLine, 0, `prod: ${joinList(draft.products)}`);
      endLine += 1;
    }

    if (draft.conditions.length > 0) {
      if (conditionsLine >= 0) {
        lines[conditionsLine] = `conditions: ${joinList(draft.conditions)}`;
      } else {
        lines.splice(endLine, 0, `conditions: ${joinList(draft.conditions)}`);
      }
    } else if (conditionsLine >= 0) {
      lines.splice(conditionsLine, 1);
    }

    return lines.join("\n");
  }

  return source;
};
