import type { ChemdEditorPosition } from "./completion-types";
import type { ChemdSourceRange } from "./types";

export interface ChemdTokenAtPosition {
  raw: string;
  symbolId: string;
  range: ChemdSourceRange;
  explicitReference: boolean;
}

export interface ChemdPositionRequest {
  source: string;
  cursorOffset?: number;
  position?: ChemdEditorPosition;
}

export const resolveEditorPosition = (
  request: ChemdPositionRequest
): ChemdEditorPosition => {
  if (typeof request.cursorOffset === "number") {
    return offsetToPosition(request.source, request.cursorOffset);
  }

  return request.position ?? { line: 1, column: 1 };
};

export const readSourceLine = (
  source: string,
  line: number
): string => source.split(/\r?\n/)[Math.max(line - 1, 0)] ?? "";

export const findTokenAtPosition = (
  source: string,
  position: ChemdEditorPosition
): ChemdTokenAtPosition | undefined => {
  const lineText = readSourceLine(source, position.line);
  const seedIndex = findTokenSeedIndex(lineText, position.column);
  if (seedIndex < 0) {
    return undefined;
  }

  const startIndex = scanTokenStart(lineText, seedIndex);
  const endIndex = scanTokenEnd(lineText, seedIndex);
  const raw = lineText.slice(startIndex, endIndex);
  const symbolId = raw.replace(/^[@#]/, "");
  return symbolId ? {
    raw,
    symbolId,
    explicitReference: raw.startsWith("@"),
    range: {
      startLine: position.line,
      startColumn: startIndex + 1,
      endLine: position.line,
      endColumn: endIndex + 1
    }
  } : undefined;
};

export const rangeContainsPosition = (
  range: ChemdSourceRange,
  position: ChemdEditorPosition
): boolean => {
  if (position.line < range.startLine || position.line > range.endLine) {
    return false;
  }
  if (position.line === range.startLine && position.column < range.startColumn) {
    return false;
  }

  return position.line !== range.endLine || position.column <= range.endColumn;
};

const offsetToPosition = (
  source: string,
  offset: number
): ChemdEditorPosition => {
  const before = source.slice(0, clamp(offset, 0, source.length));
  const lines = before.split(/\r?\n/);
  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1
  };
};

const findTokenSeedIndex = (lineText: string, column: number): number => {
  const index = clamp(column - 1, 0, Math.max(lineText.length - 1, 0));
  if (isTokenChar(lineText[index])) {
    return index;
  }
  if (index > 0 && isTokenChar(lineText[index - 1])) {
    return index - 1;
  }

  return -1;
};

const scanTokenStart = (lineText: string, seedIndex: number): number => {
  let index = seedIndex;
  while (index > 0 && isTokenChar(lineText[index - 1])) {
    index -= 1;
  }

  return index;
};

const scanTokenEnd = (lineText: string, seedIndex: number): number => {
  let index = seedIndex + 1;
  while (index < lineText.length && isTokenChar(lineText[index])) {
    index += 1;
  }

  return index;
};

const isTokenChar = (value: string | undefined): boolean =>
  Boolean(value && /[A-Za-z0-9_@#./-]/.test(value));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
