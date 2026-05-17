import type { ChemdSourceRange } from "@chemd/language-service";
import type { WorkspaceDocumentInput, WorkspaceReference } from "./types";

const REFERENCE_FIELDS = new Set([
  "ref",
  "reaction",
  "product",
  "prev",
  "next",
  "reactants",
  "products"
]);

interface ReferenceCandidate {
  field: string;
  rawText: string;
  targetText: string;
  targetDocumentAlias?: string;
  targetLocalId: string;
  range: ChemdSourceRange;
}

const isTargetChar = (char: string): boolean =>
  (char >= "A" && char <= "Z")
  || (char >= "a" && char <= "z")
  || (char >= "0" && char <= "9")
  || char === "_"
  || char === "."
  || char === "-";

const isFieldStartChar = (char: string): boolean =>
  (char >= "A" && char <= "Z") || (char >= "a" && char <= "z");

const isFieldChar = (char: string): boolean =>
  isFieldStartChar(char) || (char >= "0" && char <= "9") || char === "_" || char === "-";

const stripReferenceDecorators = (rawText: string): string => {
  let trimmed = rawText.trim();
  if (trimmed.startsWith("@")) {
    trimmed = trimmed.slice(1);
  }
  while (trimmed.endsWith(";")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const isReferenceTarget = (value: string): boolean => {
  if (!value) return false;
  const parts = value.split("#");
  if (parts.length > 2) return false;
  return parts.every((part) => part.length > 0 && Array.from(part).every(isTargetChar));
};

const splitTarget = (
  rawText: string
): Pick<ReferenceCandidate, "targetText" | "targetDocumentAlias" | "targetLocalId"> | null => {
  const trimmed = stripReferenceDecorators(rawText);
  if (!isReferenceTarget(trimmed)) {
    return null;
  }

  const [targetDocumentAlias, targetLocalId] = trimmed.includes("#")
    ? trimmed.split("#", 2)
    : [undefined, trimmed];
  if (!targetLocalId) return null;
  return { targetText: trimmed, targetDocumentAlias, targetLocalId };
};

const parseReferenceFieldLine = (
  line: string
): { field: string; value: string; valueOffset: number } | undefined => {
  let index = 0;
  while (line[index] === " " || line[index] === "\t") index += 1;
  const fieldStart = index;
  if (!isFieldStartChar(line[index] ?? "")) return undefined;
  index += 1;
  while (isFieldChar(line[index] ?? "")) index += 1;
  const field = line.slice(fieldStart, index);
  while (line[index] === " " || line[index] === "\t") index += 1;
  if (line[index] !== ":") return undefined;
  index += 1;
  while (line[index] === " " || line[index] === "\t") index += 1;
  return { field, value: line.slice(index), valueOffset: index };
};

const splitReferenceTokens = (value: string): Array<{ token: string; start: number }> => {
  const tokens: Array<{ token: string; start: number }> = [];
  let start = 0;
  for (let index = 0; index <= value.length; index += 1) {
    const char = value[index];
    if (index === value.length || char === "|" || char === "," || char === "[" || char === "]") {
      tokens.push({ token: value.slice(start, index), start });
      start = index + 1;
    }
  }
  return tokens;
};

const toRange = (
  lineIndex: number,
  startColumn: number,
  length: number
): ChemdSourceRange => ({
  startLine: lineIndex + 1,
  startColumn,
  endLine: lineIndex + 1,
  endColumn: startColumn + length
});

const extractFieldCandidates = (
  line: string,
  lineIndex: number
): ReferenceCandidate[] => {
  const parsed = parseReferenceFieldLine(line);
  if (!parsed || !REFERENCE_FIELDS.has(parsed.field)) return [];

  const candidates: ReferenceCandidate[] = [];
  for (const { token, start } of splitReferenceTokens(parsed.value)) {
    const rawText = token.trim();
    const target = splitTarget(rawText);
    if (!target) continue;
    const leadingSpaces = token.length - token.trimStart().length;
    candidates.push({
      field: parsed.field,
      rawText,
      ...target,
      range: toRange(lineIndex, parsed.valueOffset + start + leadingSpaces + 1, rawText.length)
    });
  }
  return candidates;
};

const extractAtCandidates = (line: string, lineIndex: number): ReferenceCandidate[] => {
  const candidates: ReferenceCandidate[] = [];
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "@") continue;
    let end = index + 1;
    while (isTargetChar(line[end] ?? "") || line[end] === "#") end += 1;
    const rawText = line.slice(index, end);
    const target = splitTarget(rawText);
    if (!target) continue;
    candidates.push({
      field: "@",
      rawText,
      ...target,
      range: toRange(lineIndex, index + 1, rawText.length)
    });
    index = end - 1;
  }
  return candidates;
};

const candidateKey = (candidate: ReferenceCandidate): string =>
  `${candidate.range.startLine}:${candidate.range.startColumn}:${candidate.targetText}`;

export const extractReferenceCandidates = (
  document: WorkspaceDocumentInput
): WorkspaceReference[] => {
  const seen = new Set<string>();
  return document.source.split("\n").flatMap((rawLine, lineIndex) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    const candidates = [
      ...extractFieldCandidates(line, lineIndex),
      ...extractAtCandidates(line, lineIndex)
    ];
    return candidates.flatMap((candidate) => {
      const key = candidateKey(candidate);
      if (seen.has(key)) return [];
      seen.add(key);
      return [{
        referenceId: `${document.uri}:${candidate.range.startLine}:${candidate.range.startColumn}:${candidate.targetText}`,
        documentUri: document.uri,
        documentPath: document.path,
        field: candidate.field,
        rawText: candidate.rawText,
        targetText: candidate.targetText,
        targetDocumentAlias: candidate.targetDocumentAlias,
        targetLocalId: candidate.targetLocalId,
        range: candidate.range,
        status: "unresolved",
        targetSymbolIds: []
      }];
    });
  });
};
