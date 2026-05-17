import type { ChemdSourceRange } from "./types";

const splitSourceLines = (source: string): string[] =>
  source.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

export const createDocumentRange = (source: string): ChemdSourceRange => {
  const lines = splitSourceLines(source);
  const lastLine = Math.max(lines.length, 1);
  const lastColumn = (lines[lastLine - 1]?.length ?? 0) + 1;

  return {
    startLine: 1,
    startColumn: 1,
    endLine: lastLine,
    endColumn: lastColumn
  };
};

export const createStartRange = (): ChemdSourceRange => ({
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 1
});

const readHeaderId = (headerArg: string | undefined): string | undefined => {
  const trimmed = headerArg?.trim() ?? "";
  if (!trimmed.startsWith("#")) return undefined;
  const id = trimmed.slice(1);
  const end = Array.from(id).findIndex((char) => char === " " || char === "\t");
  return end >= 0 ? id.slice(0, end) : id;
};

export const createMetadataRange = (source: string): ChemdSourceRange => {
  const lines = splitSourceLines(source);
  if (lines[0]?.trim() !== "---") {
    return createStartRange();
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  return {
    startLine: 1,
    startColumn: 1,
    endLine: endIndex >= 0 ? endIndex + 1 : 1,
    endColumn: endIndex >= 0 ? lines[endIndex].length + 1 : lines[0].length + 1
  };
};

export const createSourceHash = (source: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

export const buildBlockRangeMap = (source: string): Map<string, ChemdSourceRange> => {
  const ranges = new Map<string, ChemdSourceRange>();
  const lines = splitSourceLines(source);
  let index = 0;

  while (index < lines.length) {
    const header = readBlockHeader(lines[index]);
    const id = header ? readHeaderId(header.arg) : undefined;
    if (!header || !id) {
      index += 1;
      continue;
    }

    let endIndex = index + 1;
    while (endIndex < lines.length && lines[endIndex].trim() !== ":::") {
      endIndex += 1;
    }

    const boundedEndIndex = Math.min(endIndex, lines.length - 1);
    ranges.set(id, {
      startLine: index + 1,
      startColumn: 1,
      endLine: boundedEndIndex + 1,
      endColumn: (lines[boundedEndIndex]?.length ?? 0) + 1
    });
    index = endIndex + 1;
  }

  return ranges;
};

const readBlockHeader = (line: string): { type: string; arg?: string } | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(":::")) return undefined;
  let index = 3;
  const first = trimmed[index] ?? "";
  if (!isBlockTypeChar(first, true)) return undefined;
  index += 1;
  while (isBlockTypeChar(trimmed[index] ?? "", false)) index += 1;
  const type = trimmed.slice(3, index);
  if (index >= trimmed.length) return { type };
  if (trimmed[index] !== " " && trimmed[index] !== "\t") return undefined;
  return { type, arg: trimmed.slice(index).trim() };
};

const isBlockTypeChar = (char: string, first: boolean): boolean =>
  (char >= "A" && char <= "Z")
  || (char >= "a" && char <= "z")
  || (!first && ((char >= "0" && char <= "9") || char === "_" || char === "-"));
