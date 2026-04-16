import type { ChemdMeta } from "@chemd/core";

export const DEFAULT_META: ChemdMeta = {
  id: "draft-document",
  title: "Untitled chemd document",
  date: "1970-01-01"
};

export const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
export const FRONTMATTER_BLOCK_SCALAR_PATTERN = /^[>|][+-]?$/;
export const REQUIRED_FRONTMATTER_KEYS = ["id", "title", "date"] as const;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidIsoDateValue = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((item) => Number(item));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isScalarValue = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

export const getIndentWidth = (line: string): number => {
  const leading = line.match(/^\s*/)?.[0] ?? "";
  let width = 0;

  for (const char of leading) {
    width += char === "\t" ? 2 : 1;
  }

  return width;
};

const isLowerAlphaCode = (code: number): boolean => code >= 97 && code <= 122;

const isFrontmatterKeyBodyCode = (code: number): boolean =>
  isLowerAlphaCode(code) || (code >= 48 && code <= 57) || code === 95;

const findFrontmatterKeyEnd = (line: string): number => {
  let index = 1;

  while (index < line.length && isFrontmatterKeyBodyCode(line.charCodeAt(index))) {
    index += 1;
  }

  return index;
};

const skipInlineWhitespace = (line: string, startIndex: number): number => {
  let nextIndex = startIndex;

  while (nextIndex < line.length) {
    const code = line.charCodeAt(nextIndex);
    if (code !== 32 && code !== 9) {
      break;
    }
    nextIndex += 1;
  }

  return nextIndex;
};

export const parseFrontmatterKeyValueLine = (
  line: string
): { key: string; rawValue: string } | undefined => {
  if (!line || line.length < 2) {
    return undefined;
  }

  const first = line.charCodeAt(0);
  if (!isLowerAlphaCode(first)) {
    return undefined;
  }

  const index = findFrontmatterKeyEnd(line);
  if (index >= line.length || line.charCodeAt(index) !== 58) {
    return undefined;
  }

  const key = line.slice(0, index);
  const valueStart = skipInlineWhitespace(line, index + 1);

  return {
    key,
    rawValue: line.slice(valueStart)
  };
};
