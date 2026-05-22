const isWhitespace = (char: string): boolean =>
  char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";

const splitLines = (value: string): string[] =>
  value.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

const SENTENCE_ABBREVIATIONS = new Set([
  "aq",
  "sat",
  "conc",
  "ca",
  "eq",
  "equiv",
  "vol"
]);

const readNumberStart = (text: string, index: number, allowNegative: boolean): number | undefined => {
  if (allowNegative && text[index] === "-" && isDigit(text[index + 1] ?? "")) {
    return index;
  }

  return isDigit(text[index]) ? index : undefined;
};

const readNumberEnd = (text: string, start: number): number => {
  let cursor = start + (text[start] === "-" ? 1 : 0);
  while (isDigit(text[cursor] ?? "")) cursor += 1;
  if (text[cursor] === "." && isDigit(text[cursor + 1] ?? "")) {
    cursor += 1;
    while (isDigit(text[cursor] ?? "")) cursor += 1;
  }
  return cursor;
};

const skipUnitPrefixSpacing = (text: string, start: number): number => {
  let cursor = start;
  while (isWhitespace(text[cursor] ?? "")) cursor += 1;
  if (text[cursor] === "°") {
    cursor += 1;
    while (isWhitespace(text[cursor] ?? "")) cursor += 1;
  }
  return cursor;
};

const findUnitAt = (text: string, cursor: number, units: readonly string[]): string | undefined =>
  units.find((candidate) =>
    text.slice(cursor, cursor + candidate.length).toLowerCase() === candidate.toLowerCase()
  );

const readNumberWithUnit = (text: string, units: readonly string[], allowNegative: boolean): string | undefined => {
  for (let index = 0; index < text.length; index += 1) {
    const start = readNumberStart(text, index, allowNegative);
    if (start === undefined) continue;

    const cursor = skipUnitPrefixSpacing(text, readNumberEnd(text, start));
    const unit = findUnitAt(text, cursor, units);
    if (unit) {
      return cleanExtractedText(text.slice(start, cursor + unit.length));
    }
  }
  return undefined;
};

const stripListMarker = (line: string): string => {
  let cursor = 0;
  while (isWhitespace(line[cursor] ?? "")) cursor += 1;
  if (line[cursor] === "-" || line[cursor] === "*" || line[cursor] === "+") {
    return line.slice(cursor + 1).trimStart();
  }
  const digitStart = cursor;
  while (isDigit(line[cursor] ?? "")) cursor += 1;
  if (cursor > digitStart && [".", ")", "、"].includes(line[cursor] ?? "")) {
    cursor += 1;
    return line.slice(cursor).trimStart();
  }
  return line;
};

const readTokenBefore = (text: string, index: number): string => {
  let cursor = index - 1;
  while (cursor >= 0 && /[A-Za-z]/.test(text[cursor] ?? "")) cursor -= 1;
  return text.slice(cursor + 1, index);
};

const readNextNonWhitespace = (text: string, index: number): string | undefined => {
  let cursor = index + 1;
  while (isWhitespace(text[cursor] ?? "")) cursor += 1;
  return text[cursor];
};

const isDecimalPoint = (line: string, index: number): boolean =>
  isDigit(line[index - 1] ?? "") && isDigit(line[index + 1] ?? "");

const isAbbreviationPeriod = (line: string, index: number): boolean =>
  SENTENCE_ABBREVIATIONS.has(readTokenBefore(line, index).toLowerCase());

const isSentencePeriod = (line: string, index: number): boolean => {
  if (line[index] !== ".") return false;
  if (isDecimalPoint(line, index) || isAbbreviationPeriod(line, index)) return false;
  const next = readNextNonWhitespace(line, index);
  return next === undefined || /[A-Z0-9(]/.test(next);
};

const splitSentenceLine = (line: string): string[] => {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ("。;；".includes(char) || isSentencePeriod(line, index)) {
      result.push(line.slice(start, index + 1));
      start = index + 1;
      while (isWhitespace(line[start] ?? "")) start += 1;
    }
  }
  if (start < line.length) {
    result.push(line.slice(start));
  }
  return result;
};

const isOrderedListLine = (line: string): boolean => {
  let cursor = 0;
  while (isWhitespace(line[cursor] ?? "")) cursor += 1;
  const digitStart = cursor;
  while (isDigit(line[cursor] ?? "")) cursor += 1;
  if (cursor === digitStart) return false;
  if ([".", ")", "、"].includes(line[cursor] ?? "")) cursor += 1;
  return isWhitespace(line[cursor] ?? "");
};

export const normalizeText = (value: string): string => {
  let normalized = "";
  let pendingSpace = false;
  for (const char of value.trim()) {
    const normalizedChar = char === "−" || char === "–" ? "-" : char;
    if (isWhitespace(char)) {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += normalizedChar;
  }
  return normalized;
};

export const cleanExtractedText = (value: string): string =>
  stripTrailingCleanPunctuation(stripLeadingCleanPunctuation(normalizeText(value))).trim();

const stripLeadingCleanPunctuation = (value: string): string => {
  let index = 0;
  while ([",", "，", "、", "和", "与"].includes(value[index] ?? "") || isWhitespace(value[index] ?? "")) {
    index += 1;
  }
  return value.slice(index);
};

const stripTrailingCleanPunctuation = (value: string): string => {
  let end = value.length;
  while (["。", ".", ";", "；", ",", "，"].includes(value[end - 1] ?? "") || isWhitespace(value[end - 1] ?? "")) {
    end -= 1;
  }
  return value.slice(0, end);
};

export const extractTemperature = (text: string): string | undefined =>
  readNumberWithUnit(text, ["℃", "C", "K", "F"], true);

export const extractDuration = (text: string): string | undefined =>
  readNumberWithUnit(text, ["hrs", "hr", "h", "mins", "min", "小时", "分钟"], false);

export const extractRepeatCount = (text: string): number | undefined => {
  const lower = text.toLowerCase();
  const symbolic = lower.match(/\b(\d+)\s*[×x]\s*\d+/u);
  if (symbolic) {
    return Number(symbolic[1]);
  }

  for (let index = 0; index < lower.length; index += 1) {
    if (!isDigit(lower[index])) continue;
    let cursor = index;
    while (isDigit(lower[cursor] ?? "")) cursor += 1;
    while (isWhitespace(lower[cursor] ?? "")) cursor += 1;
    if (
      lower.startsWith("times", cursor)
      || lower.startsWith("time", cursor)
      || lower.startsWith("次", cursor)
    ) {
      return Number(lower.slice(index, cursor).trim());
    }
    index = cursor;
  }

  if (text.includes("三次")) {
    return 3;
  }

  if (text.includes("两次") || text.includes("二次")) {
    return 2;
  }

  return undefined;
};

export const splitProcedureSentences = (body: string | undefined): string[] => {
  if (!body?.trim()) {
    return [];
  }

  const rawLines = splitLines(body).filter((line) => line.trim());
  const hasOrderedLines = rawLines.some(isOrderedListLine);
  const sentenceInputs = hasOrderedLines
    ? rawLines.map(stripListMarker)
    : [rawLines.map((line) => stripListMarker(line).trim()).join(" ")];

  return sentenceInputs
    .flatMap(splitSentenceLine)
    .map(normalizeText)
    .filter(Boolean);
};

export const detectStructureHint = (body: string | undefined): "ordered_list" | "paragraph" | "mixed" => {
  if (!body?.trim()) {
    return "paragraph";
  }

  const lines = splitLines(body).filter((line) => line.trim());
  const orderedCount = lines.filter(isOrderedListLine).length;

  if (orderedCount === 0) {
    return "paragraph";
  }

  return orderedCount === lines.length ? "ordered_list" : "mixed";
};
