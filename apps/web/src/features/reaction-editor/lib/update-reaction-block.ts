import type { ReactionEditorDraft } from "../types";

const REACTION_OPEN_RE = /^:::reaction(?:\s+#([^\s]+))?/;
const BLOCK_CLOSE_RE = /^:::$/;
const REACTANTS_RE = /^\s*reactants\s*:/i;
const PRODUCTS_RE = /^\s*products\s*:/i;
const CONDITIONS_RE = /^\s*conditions\s*:/i;

const joinList = (values: string[]): string => values.join(" | ");

export const updateReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const lines = source.split(/\r?\n/);
  const targetOpen = `:::reaction #${blockId}`;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const openMatch = openLine.match(REACTION_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    const existingId = (openMatch[1] ?? "").trim().replace(/^#/, "");
    if (existingId !== blockId) {
      continue;
    }

    lines[index] = targetOpen;

    let endLine = index;
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
      lines[reactantsLine] = `reactants: ${joinList(draft.reactants)}`;
    } else {
      lines.splice(endLine, 0, `reactants: ${joinList(draft.reactants)}`);
      endLine += 1;
    }

    if (productsLine >= 0) {
      lines[productsLine] = `products: ${joinList(draft.products)}`;
    } else {
      lines.splice(endLine, 0, `products: ${joinList(draft.products)}`);
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
