import type {
  AuthoringPatch,
  AuthoringSuggestion,
  AuthoringTemplate
} from "./authoring-types";

const BLOCK_CLOSE_RE = /^\s*:::\s*$/;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readEol = (source: string): string => (source.includes("\r\n") ? "\r\n" : "\n");

const splitText = (value: string): string[] => value.split(/\r?\n/);

const splitSource = (source: string): string[] => source.split(/\r?\n/);

const buildBlockHeaderRe = (blockId: string): RegExp =>
  new RegExp(`^\\s*:::[^\\n#]*\\s+#${escapeRegExp(blockId)}(?:\\s|$)`);

const buildFieldLineRe = (field: string): RegExp =>
  new RegExp(`^\\s*${escapeRegExp(field)}\\s*:`,"i");

const findBlockRange = (
  lines: string[],
  blockId: string
): { headerIndex: number; endIndex: number } | undefined => {
  const headerRe = buildBlockHeaderRe(blockId);

  for (let index = 0; index < lines.length; index += 1) {
    if (!headerRe.test(lines[index] ?? "")) {
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < lines.length && !BLOCK_CLOSE_RE.test(lines[endIndex] ?? "")) {
      endIndex += 1;
    }

    return { headerIndex: index, endIndex };
  }

  return undefined;
};

const insertSegment = (
  lines: string[],
  insertIndex: number,
  segmentLines: string[]
): string[] => {
  const needsLeadingBlank = insertIndex > 0 && lines[insertIndex - 1]?.trim() !== "";
  const needsTrailingBlank = insertIndex < lines.length && lines[insertIndex]?.trim() !== "";
  const insertLines = [
    ...(needsLeadingBlank ? [""] : []),
    ...segmentLines,
    ...(needsTrailingBlank ? [""] : [])
  ];

  return [...lines.slice(0, insertIndex), ...insertLines, ...lines.slice(insertIndex)];
};

const applyAppendDocumentText = (source: string, text: string): string => {
  const eol = readEol(source);
  const trimmed = source.trimEnd();
  const segment = text.trim();

  if (!segment) {
    return source;
  }

  return trimmed.length === 0
    ? `${segment}${eol}`
    : `${trimmed}${eol}${eol}${segment}${eol}`;
};

const applyInsertAfterBlock = (
  source: string,
  blockId: string,
  text: string
): string => {
  const lines = splitSource(source);
  const block = findBlockRange(lines, blockId);
  if (!block) {
    return applyAppendDocumentText(source, text);
  }

  const nextLines = insertSegment(lines, block.endIndex + 1, splitText(text.trim()));
  return nextLines.join(readEol(source));
};

const findAnchorIndex = (
  lines: string[],
  headerIndex: number,
  endIndex: number,
  anchorFields: string[] | undefined
): number => {
  if (!anchorFields || anchorFields.length === 0) {
    return headerIndex;
  }

  for (let fieldIndex = anchorFields.length - 1; fieldIndex >= 0; fieldIndex -= 1) {
    const anchorRe = buildFieldLineRe(anchorFields[fieldIndex] ?? "");
    for (let scan = endIndex - 1; scan > headerIndex; scan -= 1) {
      if (anchorRe.test(lines[scan] ?? "")) {
        return scan;
      }
    }
  }

  return headerIndex;
};

const applyInsertFieldLine = (
  source: string,
  blockId: string,
  line: string,
  anchorFields?: string[]
): string => {
  const lines = splitSource(source);
  const block = findBlockRange(lines, blockId);
  if (!block) {
    return source;
  }

  const normalizedLine = line.trim();
  const bodyLines = lines.slice(block.headerIndex + 1, block.endIndex);
  if (bodyLines.some((bodyLine) => bodyLine.trim() === normalizedLine)) {
    return source;
  }

  const anchorIndex = findAnchorIndex(lines, block.headerIndex, block.endIndex, anchorFields);
  const nextLines = [...lines];
  nextLines.splice(anchorIndex + 1, 0, line);
  return nextLines.join(readEol(source));
};

export const applyAuthoringPatch = (source: string, patch: AuthoringPatch): string => {
  if (patch.kind === "append_document_text") {
    return applyAppendDocumentText(source, patch.text);
  }

  if (patch.kind === "insert_after_block") {
    return applyInsertAfterBlock(source, patch.blockId, patch.text);
  }

  return applyInsertFieldLine(source, patch.blockId, patch.line, patch.anchorFields);
};

export const applyAuthoringSuggestion = (
  source: string,
  suggestion: AuthoringSuggestion
): string => applyAuthoringPatch(source, suggestion.patch);

export const applyAuthoringTemplate = (
  source: string,
  template: AuthoringTemplate
): string => applyAuthoringPatch(source, template.patch);
