import type {
  AuthoringPatch,
  AuthoringSuggestion,
  AuthoringTemplate
} from "./authoring-types";

const DECLARATION_RE = /^\s*(molecule|material|batch|reaction|result|analysis|sample|artifact|condition_screen|procedure|observation|trace|agent\s+run)\s+([A-Za-z_][\w-]*)\b/;
const META_RE = /^\s*meta\s*\{\s*$/;
const MODULE_RE = /^\s*module\b/;

const readEol = (source: string): string => (source.includes("\r\n") ? "\r\n" : "\n");

const splitText = (value: string): string[] => value.split(/\r?\n/);

const splitSource = (source: string): string[] => source.split(/\r?\n/);

const readFieldFromLine = (line: string): string | undefined => {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex <= 0) return undefined;
  const field = line.slice(0, separatorIndex).trim();
  return field.length > 0 ? field : undefined;
};

const buildFieldLineRe = (field: string): RegExp =>
  new RegExp(`^\\s*${field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`, "i");

const countChar = (line: string, char: "{" | "}"): number =>
  [...line].filter((item) => item === char).length;

const findBraceRange = (
  lines: string[],
  startIndex: number
): { startIndex: number; endIndex: number } | undefined => {
  let depth = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    depth += countChar(lines[index] ?? "", "{");
    depth -= countChar(lines[index] ?? "", "}");
    if (depth === 0 && index > startIndex) {
      return { startIndex, endIndex: index };
    }
  }
  return undefined;
};

const findDeclarationRange = (
  lines: string[],
  declarationId: string
): { startIndex: number; endIndex: number } | undefined => {
  for (let index = 0; index < lines.length; index += 1) {
    const match = DECLARATION_RE.exec(lines[index] ?? "");
    if (match?.[2] === declarationId) {
      return findBraceRange(lines, index);
    }
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
  if (!segment) return source;
  return trimmed.length === 0 ? `${segment}${eol}` : `${trimmed}${eol}${eol}${segment}${eol}`;
};

const findAnchorIndex = (
  lines: string[],
  startIndex: number,
  endIndex: number,
  anchorFields: string[] | undefined
): number => {
  for (let fieldIndex = (anchorFields?.length ?? 0) - 1; fieldIndex >= 0; fieldIndex -= 1) {
    const anchorRe = buildFieldLineRe(anchorFields?.[fieldIndex] ?? "");
    for (let scan = endIndex - 1; scan > startIndex; scan -= 1) {
      if (anchorRe.test(lines[scan] ?? "")) return scan;
    }
  }
  return endIndex - 1;
};

const normalizeFieldLine = (line: string): string =>
  line.startsWith("  ") ? line : `  ${line.trim()}`;

const applyInsertAfterDeclaration = (
  source: string,
  declarationId: string,
  text: string
): string => {
  const lines = splitSource(source);
  const declaration = findDeclarationRange(lines, declarationId);
  if (!declaration) return applyAppendDocumentText(source, text);
  return insertSegment(lines, declaration.endIndex + 1, splitText(text.trim())).join(readEol(source));
};

const applyInsertDeclarationField = (
  source: string,
  declarationId: string,
  line: string,
  anchorFields?: string[]
): string => {
  const lines = splitSource(source);
  const declaration = findDeclarationRange(lines, declarationId);
  if (!declaration) return source;
  const normalizedLine = normalizeFieldLine(line);
  const bodyLines = lines.slice(declaration.startIndex + 1, declaration.endIndex);
  if (bodyLines.some((bodyLine) => bodyLine.trim() === normalizedLine.trim())) return source;
  const anchorIndex = findAnchorIndex(lines, declaration.startIndex, declaration.endIndex, anchorFields);
  const nextLines = [...lines];
  nextLines.splice(anchorIndex + 1, 0, normalizedLine);
  return nextLines.join(readEol(source));
};

const findMetaRange = (lines: string[]): { startIndex: number; endIndex: number } | undefined => {
  for (let index = 0; index < lines.length; index += 1) {
    if (META_RE.test(lines[index] ?? "")) return findBraceRange(lines, index);
  }
  return undefined;
};

const createMetaBlock = (source: string, line: string): string => {
  const eol = readEol(source);
  const lines = splitSource(source);
  const moduleIndex = lines.findIndex((item) => MODULE_RE.test(item));
  const insertIndex = moduleIndex >= 0 ? moduleIndex + 1 : 0;
  const metaLines = ["", "meta {", normalizeFieldLine(line), "}"];
  return [...lines.slice(0, insertIndex), ...metaLines, ...lines.slice(insertIndex)].join(eol);
};

const applyInsertMetaField = (
  source: string,
  line: string,
  anchorFields?: string[]
): string => {
  const lines = splitSource(source);
  const normalizedLine = normalizeFieldLine(line);
  const field = readFieldFromLine(normalizedLine);
  const meta = findMetaRange(lines);
  if (!meta) return createMetaBlock(source, normalizedLine);
  const bodyLines = lines.slice(meta.startIndex + 1, meta.endIndex);
  if (field && bodyLines.some((bodyLine) => buildFieldLineRe(field).test(bodyLine))) return source;
  const anchorIndex = findAnchorIndex(lines, meta.startIndex, meta.endIndex, anchorFields);
  const nextLines = [...lines];
  nextLines.splice(anchorIndex + 1, 0, normalizedLine);
  return nextLines.join(readEol(source));
};

export const applyAuthoringPatch = (source: string, patch: AuthoringPatch): string => {
  if (patch.kind === "batch") {
    return patch.patches.reduce(
      (currentSource, nextPatch) => applyAuthoringPatch(currentSource, nextPatch),
      source
    );
  }
  if (patch.kind === "append_document_text") return applyAppendDocumentText(source, patch.text);
  if (patch.kind === "insert_after_declaration") {
    return applyInsertAfterDeclaration(source, patch.declarationId, patch.text);
  }
  if (patch.kind === "insert_meta_field") {
    return applyInsertMetaField(source, patch.line, patch.anchorFields);
  }
  return applyInsertDeclarationField(source, patch.declarationId, patch.line, patch.anchorFields);
};

export const applyAuthoringSuggestion = (
  source: string,
  suggestion: AuthoringSuggestion
): string => applyAuthoringPatch(source, suggestion.patch);

export const applyAuthoringTemplate = (
  source: string,
  template: AuthoringTemplate
): string => applyAuthoringPatch(source, template.patch);
