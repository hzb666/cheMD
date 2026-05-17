const isWhitespace = (char: string): boolean =>
  char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";

const splitLines = (value: string): string[] =>
  value.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const isDigit = (char: string): boolean => char >= "0" && char <= "9";

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

const splitSentenceLine = (line: string): string[] => {
  const result: string[] = [];
  let start = 0;
  for (let index = 0; index < line.length; index += 1) {
    if ("。.;；".includes(line[index])) {
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
    if (isWhitespace(char)) {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace) {
      normalized += " ";
      pendingSpace = false;
    }
    normalized += char;
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

  return body
    .split("\n")
    .map((line) => stripListMarker(line.endsWith("\r") ? line.slice(0, -1) : line))
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
