export const normalizeText = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

export const cleanExtractedText = (value: string): string =>
  normalizeText(value)
    .replace(/^[,，、和与\s]+/, "")
    .replace(/[。.;；,，]+$/, "")
    .trim();

export const extractFirst = (text: string, pattern: RegExp): string | undefined => {
  const match = text.match(pattern);
  return match?.[1] ? cleanExtractedText(match[1]) : undefined;
};

export const extractTemperature = (text: string): string | undefined =>
  extractFirst(text, /(-?\d+(?:\.\d+)?\s*(?:°\s*C|℃|C|K|F))/i);

export const extractDuration = (text: string): string | undefined =>
  extractFirst(text, /(\d+(?:\.\d+)?\s*(?:h|hr|hrs|min|mins|小时|分钟))/i);

export const extractRepeatCount = (text: string): number | undefined => {
  const arabic = text.match(/(\d+)\s*(?:次|times?)/i);
  if (arabic) {
    return Number(arabic[1]);
  }

  if (/三次/.test(text)) {
    return 3;
  }

  if (/两次|二次/.test(text)) {
    return 2;
  }

  return undefined;
};

export const splitProcedureSentences = (body: string | undefined): string[] => {
  if (!body?.trim()) {
    return [];
  }

  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)、]?|[-*+])\s*/, ""))
    .flatMap((line) => line.split(/(?<=[。.;；])\s*/u))
    .map(normalizeText)
    .filter(Boolean);
};

export const detectStructureHint = (body: string | undefined): "ordered_list" | "paragraph" | "mixed" => {
  if (!body?.trim()) {
    return "paragraph";
  }

  const lines = body.split(/\r?\n/).filter((line) => line.trim());
  const orderedCount = lines.filter((line) => /^\s*\d+[.)、]?\s+/.test(line)).length;

  if (orderedCount === 0) {
    return "paragraph";
  }

  return orderedCount === lines.length ? "ordered_list" : "mixed";
};
