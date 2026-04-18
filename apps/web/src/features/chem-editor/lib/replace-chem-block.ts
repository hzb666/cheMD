import { ensureBlockId } from "../../ocr/lib/ensure-block-id";
import type { ChemEditorDraft } from "../types";

const CHEMD_OPEN_RE = /^:::chemd(?:\s+#([^\s]+))?/;
const BLOCK_CLOSE_RE = /^:::$/;

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

const parseFieldKey = (line: string): string | null => {
  const match = line.match(/^\s*([a-z][a-z0-9_]*)\s*:/);
  return match?.[1] ?? null;
};

const pickPreservedLines = (lines: string[], allowedKeys: Set<string>): string[] =>
  lines.filter((line) => {
    const key = parseFieldKey(line);
    return !key || allowedKeys.has(key);
  });

const serializeChemBlock = (blockId: string, draft: ChemEditorDraft, existingLines: string[]): string[] => {
  if (draft.kind === "reaction") {
    const preservedLines = pickPreservedLines(existingLines, REACTION_METADATA_KEYS);
    const lines = [
      `:::chemd #${blockId}`,
      "kind: reaction",
      `reac: ${draft.reactants.join(" | ")}`,
      `prod: ${draft.products.join(" | ")}`
    ];

    if (draft.conditions.length > 0) {
      lines.push(`conditions: ${draft.conditions.join(" | ")}`);
    }

    lines.push(...preservedLines);
    lines.push(":::");
    return lines;
  }

  return [
    `:::chemd #${blockId}`,
    "kind: molecule",
    `smiles: ${draft.smiles}`,
    ...pickPreservedLines(existingLines, MOLECULE_METADATA_KEYS),
    ":::"
  ];
};

export const replaceChemBlock = (
  source: string,
  blockId: string,
  draft: ChemEditorDraft
): string | null => {
  const lines = source.split(/\r?\n/);
  let chemdOrdinal = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openLine = lines[index] ?? "";
    const chemdMatch = openLine.match(CHEMD_OPEN_RE);
    const existingId = chemdMatch
      ? ensureBlockId(chemdMatch[1], "chem", ++chemdOrdinal)
      : null;
    if (!existingId || existingId !== blockId) {
      continue;
    }

    let endLine = lines.length;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (BLOCK_CLOSE_RE.test(lines[scan] ?? "")) {
        endLine = scan;
        break;
      }
    }

    const hasClosingMarker = endLine < lines.length && BLOCK_CLOSE_RE.test(lines[endLine] ?? "");
    const existingLines = lines.slice(index + 1, endLine);
    const deleteCount = hasClosingMarker ? endLine - index + 1 : endLine - index;
    lines.splice(index, deleteCount, ...serializeChemBlock(blockId, draft, existingLines));
    return lines.join("\n");
  }

  return null;
};
