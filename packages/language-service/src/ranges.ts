import type { SourceSpan } from "@chemd/core";
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

export const sourceSpanToRange = (
  sourceSpan: SourceSpan | undefined,
  fallback: ChemdSourceRange
): ChemdSourceRange => {
  if (
    typeof sourceSpan?.startLine !== "number" ||
    typeof sourceSpan.startColumn !== "number" ||
    typeof sourceSpan.endLine !== "number" ||
    typeof sourceSpan.endColumn !== "number"
  ) {
    return fallback;
  }

  return {
    startLine: Math.max(1, sourceSpan.startLine),
    startColumn: Math.max(1, sourceSpan.startColumn),
    endLine: Math.max(sourceSpan.startLine, sourceSpan.endLine),
    endColumn: Math.max(1, sourceSpan.endColumn)
  };
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
  const stack: Array<{ id: string; startIndex: number }> = [];

  lines.forEach((line, index) => {
    const declaration = line.match(/^\s*[A-Za-z_][\w-]*\s+([A-Za-z_][\w-]*)(?:\s+for\s+@[A-Za-z0-9_.#/-]+)?\s*\{/u);
    if (declaration) {
      stack.push({ id: declaration[1] ?? "unknown", startIndex: index });
      return;
    }
    if (line.trim() !== "}") return;
    const open = stack.pop();
    if (!open) return;
    ranges.set(open.id, {
      startLine: open.startIndex + 1,
      startColumn: 1,
      endLine: index + 1,
      endColumn: (lines[index]?.length ?? 0) + 1
    });
  });

  const endIndex = Math.max(lines.length - 1, 0);
  for (const open of stack) {
    ranges.set(open.id, {
      startLine: open.startIndex + 1,
      startColumn: 1,
      endLine: endIndex + 1,
      endColumn: (lines[endIndex]?.length ?? 0) + 1
    });
  }

  return ranges;
};
