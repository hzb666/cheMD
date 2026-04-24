import type {
  AuthoringPatch,
  AuthoringSuggestion,
  AuthoringTemplate
} from "./authoring-types";

const BLOCK_CLOSE_RE = /^\s*:::\s*$/;
const FRONTMATTER_BOUNDARY_RE = /^\s*---\s*$/;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readEol = (source: string): string => (source.includes("\r\n") ? "\r\n" : "\n");

const splitText = (value: string): string[] => value.split(/\r?\n/);

const splitSource = (source: string): string[] => source.split(/\r?\n/);

const buildBlockHeaderRe = (blockId: string): RegExp =>
  new RegExp(`^\\s*:::[^\\n#]*\\s+#${escapeRegExp(blockId)}(?:\\s|$)`);

const buildFieldLineRe = (field: string): RegExp =>
  new RegExp(`^\\s*${escapeRegExp(field)}\\s*:`,"i");

const readFieldFromLine = (line: string): string | undefined => {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) {
    return undefined;
  }

  const field = line.slice(0, separatorIndex).trim();
  return field.length > 0 ? field : undefined;
};

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

const findFrontmatterRange = (lines: string[]): { startIndex: number; endIndex: number } | undefined => {
  if (!FRONTMATTER_BOUNDARY_RE.test(lines[0] ?? "")) {
    return undefined;
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (FRONTMATTER_BOUNDARY_RE.test(lines[index] ?? "")) {
      return { startIndex: 0, endIndex: index };
    }
  }

  return undefined;
};

const findFrontmatterAnchorIndex = (
  lines: string[],
  startIndex: number,
  endIndex: number,
  anchorFields: string[] | undefined
): number => {
  if (!anchorFields || anchorFields.length === 0) {
    return endIndex - 1;
  }

  for (let fieldIndex = anchorFields.length - 1; fieldIndex >= 0; fieldIndex -= 1) {
    const anchorRe = buildFieldLineRe(anchorFields[fieldIndex] ?? "");
    for (let scan = endIndex - 1; scan > startIndex; scan -= 1) {
      if (anchorRe.test(lines[scan] ?? "")) {
        return scan;
      }
    }
  }

  return endIndex - 1;
};

const applyInsertFrontmatterLine = (
  source: string,
  line: string,
  anchorFields?: string[]
): string => {
  const eol = readEol(source);
  const lines = splitSource(source);
  const normalizedLine = line.trim();
  const field = readFieldFromLine(normalizedLine);
  const frontmatter = findFrontmatterRange(lines);

  if (!frontmatter) {
    const trimmed = source.trimStart();
    const prefix = ["---", normalizedLine, "---", ""].join(eol);
    return trimmed.length > 0 ? `${prefix}${trimmed}` : `${prefix}`;
  }

  const bodyLines = lines.slice(frontmatter.startIndex + 1, frontmatter.endIndex);
  if (field && bodyLines.some((bodyLine) => buildFieldLineRe(field).test(bodyLine))) {
    return source;
  }

  if (bodyLines.some((bodyLine) => bodyLine.trim() === normalizedLine)) {
    return source;
  }

  const anchorIndex = findFrontmatterAnchorIndex(
    lines,
    frontmatter.startIndex,
    frontmatter.endIndex,
    anchorFields
  );
  const nextLines = [...lines];
  nextLines.splice(anchorIndex + 1, 0, normalizedLine);
  return nextLines.join(eol);
};

export const applyAuthoringPatch = (source: string, patch: AuthoringPatch): string => {
  if (patch.kind === "batch") {
    return patch.patches.reduce(
      (currentSource, nextPatch) => applyAuthoringPatch(currentSource, nextPatch),
      source
    );
  }

  if (patch.kind === "append_document_text") {
    return applyAppendDocumentText(source, patch.text);
  }

  if (patch.kind === "insert_after_block") {
    return applyInsertAfterBlock(source, patch.blockId, patch.text);
  }

  if (patch.kind === "insert_frontmatter_line") {
    return applyInsertFrontmatterLine(source, patch.line, patch.anchorFields);
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
