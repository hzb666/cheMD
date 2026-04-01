export const getOffsetLineColumn = (
  value: string,
  offset: number
): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (value.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: offset - lineStart + 1
  };
};

export const getMatchSpan = (
  value: string,
  match: RegExpMatchArray
): {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
} => {
  if (typeof match.index !== "number") {
    return {};
  }

  const start = match.index;
  const end = start + match[0].length;
  const startLocation = getOffsetLineColumn(value, start);
  const endLocation = getOffsetLineColumn(value, end);

  return {
    start,
    end,
    startLine: startLocation.line,
    startColumn: startLocation.column,
    endLine: endLocation.line,
    endColumn: endLocation.column
  };
};

export const getSpanFromOffsets = (
  value: string,
  start: number,
  end: number
): {
  start: number;
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
} => {
  const startLocation = getOffsetLineColumn(value, start);
  const endLocation = getOffsetLineColumn(value, end);

  return {
    start,
    end,
    startLine: startLocation.line,
    startColumn: startLocation.column,
    endLine: endLocation.line,
    endColumn: endLocation.column
  };
};
