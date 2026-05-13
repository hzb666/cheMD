import type { ChemdSourceRange } from "./types";

export const createDocumentRange = (source: string): ChemdSourceRange => {
  const lines = source.split(/\r?\n/);
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
  return trimmed.startsWith("#") ? trimmed.slice(1).split(/\s+/, 1)[0] : undefined;
};

export const createMetadataRange = (source: string): ChemdSourceRange => {
  const lines = source.split(/\r?\n/);
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
  const lines = source.split(/\r?\n/);
  const headerPattern = /^\s*:::([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(.*))?\s*$/;
  let index = 0;

  while (index < lines.length) {
    const match = lines[index].match(headerPattern);
    const id = match ? readHeaderId(match[2]) : undefined;
    if (!match || !id) {
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
