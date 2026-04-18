import { ensureBlockId } from "../../ocr/lib/ensure-block-id";

import type { ReactionEditorDraft } from "../types";

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
const BLOCK_CLOSE_RE = /^:::$/;
const REACTANTS_RE = /^\s*(?:reac|reactant|reactants)\s*:/i;
const PRODUCTS_RE = /^\s*(?:prod|product|products)\s*:/i;
const CONDITIONS_RE = /^\s*conditions\s*:/i;
const KIND_RE = /^\s*kind\s*:/i;

const joinList = (values: string[]): string => values.join(" | ");

interface ReactionBlockRange {
  startLine: number;
  endLine: number;
}

interface ReactionFieldLines {
  reactantsLine: number;
  productsLine: number;
  conditionsLine: number;
}

const findReactionBlock = (lines: string[], blockId: string): ReactionBlockRange | null => {
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

    return {
      startLine: index,
      endLine: findBlockEnd(lines, index)
    };
  }

  return null;
};

const findBlockEnd = (lines: string[], startLine: number): number => {
  for (let scan = startLine + 1; scan < lines.length; scan += 1) {
    if (BLOCK_CLOSE_RE.test(lines[scan] ?? "")) {
      return scan;
    }
  }

  return lines.length;
};

const findReactionFieldLines = (
  lines: string[],
  startLine: number,
  endLine: number
): ReactionFieldLines => {
  const fieldLines: ReactionFieldLines = {
    reactantsLine: -1,
    productsLine: -1,
    conditionsLine: -1
  };

  for (let scan = startLine + 1; scan < endLine; scan += 1) {
    const line = lines[scan] ?? "";
    if (REACTANTS_RE.test(line)) {
      fieldLines.reactantsLine = scan;
    } else if (PRODUCTS_RE.test(line)) {
      fieldLines.productsLine = scan;
    } else if (CONDITIONS_RE.test(line)) {
      fieldLines.conditionsLine = scan;
    }
  }

  return fieldLines;
};

const upsertReactionLine = (
  lines: string[],
  lineIndex: number,
  endLine: number,
  nextLine: string
): number => {
  if (lineIndex >= 0) {
    lines[lineIndex] = nextLine;
    return endLine;
  }

  lines.splice(endLine, 0, nextLine);
  return endLine + 1;
};

const ensureReactionKindLine = (lines: string[], startLine: number, endLine: number): number => {
  for (let scan = startLine + 1; scan < endLine; scan += 1) {
    if (KIND_RE.test(lines[scan] ?? "")) {
      lines[scan] = "kind: reaction";
      return endLine;
    }
  }

  lines.splice(startLine + 1, 0, "kind: reaction");
  return endLine + 1;
};

const updateConditionsLine = (
  lines: string[],
  lineIndex: number,
  endLine: number,
  conditions: string[]
): void => {
  if (conditions.length > 0) {
    upsertReactionLine(lines, lineIndex, endLine, `conditions: ${joinList(conditions)}`);
    return;
  }

  if (lineIndex >= 0) {
    lines.splice(lineIndex, 1);
  }
};

export const updateReactionBlock = (
  source: string,
  blockId: string,
  draft: ReactionEditorDraft
): string => {
  const lines = source.split(/\r?\n/);
  const targetOpen = `:::chemd #${blockId}`;
  const block = findReactionBlock(lines, blockId);

  if (!block) {
    return source;
  }

  lines[block.startLine] = targetOpen;
  const blockEndLine = ensureReactionKindLine(lines, block.startLine, block.endLine);
  const fieldLines = findReactionFieldLines(lines, block.startLine, blockEndLine);

  // 只改 reaction 编辑器托管的三类字段，其它 metadata 保持原有顺序和内容。
  const nextEndLine = upsertReactionLine(
    lines,
    fieldLines.reactantsLine,
    blockEndLine,
    `reac: ${joinList(draft.reactants)}`
  );
  const finalEndLine = upsertReactionLine(
    lines,
    fieldLines.productsLine,
    nextEndLine,
    `prod: ${joinList(draft.products)}`
  );
  updateConditionsLine(lines, fieldLines.conditionsLine, finalEndLine, draft.conditions);

  return lines.join("\n");
};
