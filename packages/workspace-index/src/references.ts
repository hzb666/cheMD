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

const splitTarget = (
  rawText: string
): Pick<ReferenceCandidate, "targetText" | "targetDocumentAlias" | "targetLocalId"> | null => {
  const trimmed = rawText.trim().replace(/^@/, "").replace(/[;]+$/, "");
  if (!/^[A-Za-z0-9_.-]+(?:#[A-Za-z0-9_.-]+)?$/.test(trimmed)) {
    return null;
  }

  const [targetDocumentAlias, targetLocalId] = trimmed.includes("#")
    ? trimmed.split("#", 2)
    : [undefined, trimmed];
  if (!targetLocalId) return null;
  return { targetText: trimmed, targetDocumentAlias, targetLocalId };
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
  const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
  if (!match || !REFERENCE_FIELDS.has(match[2])) return [];

  const prefixLength = match[1].length + match[2].length + 1;
  const valueOffset = prefixLength + (match[0].length - match[3].length - prefixLength);
  const candidates: ReferenceCandidate[] = [];
  let tokenStart = 0;
  for (const token of match[3].split(/[|,[\]]/)) {
    const relativeStart = match[3].indexOf(token, tokenStart);
    const rawText = token.trim();
    tokenStart = relativeStart + token.length;
    const target = splitTarget(rawText);
    if (!target || relativeStart < 0) continue;
    const leadingSpaces = token.length - token.trimStart().length;
    candidates.push({
      field: match[2],
      rawText,
      ...target,
      range: toRange(lineIndex, valueOffset + relativeStart + leadingSpaces + 1, rawText.length)
    });
  }
  return candidates;
};

const extractAtCandidates = (line: string, lineIndex: number): ReferenceCandidate[] => {
  const candidates: ReferenceCandidate[] = [];
  const pattern = /@([A-Za-z0-9_.-]+(?:#[A-Za-z0-9_.-]+)?)/g;
  for (const match of line.matchAll(pattern)) {
    const rawText = match[0];
    const target = splitTarget(rawText);
    if (!target || match.index === undefined) continue;
    candidates.push({
      field: "@",
      rawText,
      ...target,
      range: toRange(lineIndex, match.index + 1, rawText.length)
    });
  }
  return candidates;
};

const candidateKey = (candidate: ReferenceCandidate): string =>
  `${candidate.range.startLine}:${candidate.range.startColumn}:${candidate.targetText}`;

export const extractReferenceCandidates = (
  document: WorkspaceDocumentInput
): WorkspaceReference[] => {
  const seen = new Set<string>();
  return document.source.split(/\r?\n/).flatMap((line, lineIndex) => {
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
