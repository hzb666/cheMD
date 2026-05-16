import type { EditorGraphRagSourceRange } from "@chemd/language-service";

import type { WorkspaceRagResult } from "./rag-citation-gate";

export type ConnectedRagBlockedReason = "missing_required_field" | "duplicate_result";

export type ConnectedRagRequiredField =
  | "citationId"
  | "revisionId"
  | "chunkId"
  | "sourceRange";

export interface ConnectedRagRow {
  rowId?: string | null;
  citationId?: string | null;
  revisionId?: string | null;
  chunkId?: string | null;
  sourceRange?: EditorGraphRagSourceRange | null;
  documentPath?: string | null;
  documentUri?: string | null;
  sourceUri?: string | null;
  text?: string | null;
  label?: string | null;
  detail?: string | null;
  score?: number | null;
  distance?: number | null;
}

export interface ConnectedRagBlockedItem {
  rowId: string;
  reason: ConnectedRagBlockedReason;
  missingFields: ConnectedRagRequiredField[];
}

export interface ConnectedRagBlockedSummary {
  count: number;
  reasons: Partial<Record<ConnectedRagBlockedReason, number>>;
  items: ConnectedRagBlockedItem[];
}

export interface MergedRagResult extends WorkspaceRagResult {
  source: "local" | "connected";
  score?: number;
  distance?: number;
}

export interface ConnectedRagMergeInput {
  localResults: readonly WorkspaceRagResult[];
  connectedRows: readonly ConnectedRagRow[];
}

export interface ConnectedRagMergeResult {
  results: MergedRagResult[];
  blocked: ConnectedRagBlockedSummary;
}

interface RankedRagResult {
  result: MergedRagResult;
  rank: number;
  order: number;
}

const emptyBlockedSummary = (): ConnectedRagBlockedSummary => ({
  count: 0,
  reasons: {},
  items: []
});

const nonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const hasUsableRange = (range: EditorGraphRagSourceRange): boolean =>
  typeof range.startLine === "number" && typeof range.endLine === "number";

const rangeLocator = (range: EditorGraphRagSourceRange): string => {
  if (range.startLine === range.endLine) {
    return `L${range.startLine}`;
  }
  return `L${range.startLine}-L${range.endLine}`;
};

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const addBlockedItem = (
  summary: ConnectedRagBlockedSummary,
  item: ConnectedRagBlockedItem
): void => {
  summary.count += 1;
  summary.reasons[item.reason] = (summary.reasons[item.reason] ?? 0) + 1;
  summary.items.push(item);
};

const rowIdentity = (row: ConnectedRagRow, index: number): string =>
  row.rowId?.trim()
  || row.citationId?.trim()
  || row.chunkId?.trim()
  || `connected-row-${index + 1}`;

const missingRequiredFields = (
  row: ConnectedRagRow
): ConnectedRagRequiredField[] => {
  const missing: ConnectedRagRequiredField[] = [];
  if (!nonBlank(row.citationId ?? undefined)) missing.push("citationId");
  if (!nonBlank(row.revisionId ?? undefined)) missing.push("revisionId");
  if (!nonBlank(row.chunkId ?? undefined)) missing.push("chunkId");
  if (!row.sourceRange || !hasUsableRange(row.sourceRange)) missing.push("sourceRange");
  return missing;
};

const finiteNumber = (value: number | null | undefined): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const rankForResult = (score: number | undefined, distance: number | undefined): number => {
  if (score !== undefined) return score;
  if (distance !== undefined) return -distance;
  return 0;
};

const fallbackDocumentPath = (row: ConnectedRagRow): string =>
  row.documentPath?.trim()
  || row.documentUri?.trim()
  || `connected-rag/${row.revisionId}/${row.chunkId}`;

const fallbackDocumentUri = (row: ConnectedRagRow, documentPath: string): string =>
  row.documentUri?.trim()
  || `connected-rag://${encodeURIComponent(row.revisionId ?? "revision")}/${encodeURIComponent(row.chunkId ?? "chunk")}/${documentPath}`;

const labelForRow = (row: ConnectedRagRow): string =>
  truncate(
    (row.label ?? row.text ?? row.chunkId ?? "Connected RAG result").replace(/\s+/g, " ").trim(),
    96
  );

const toConnectedResult = (
  row: ConnectedRagRow,
  index: number
): RankedRagResult | null => {
  if (missingRequiredFields(row).length > 0) {
    return null;
  }

  const citationId = row.citationId?.trim() as string;
  const revisionId = row.revisionId?.trim() as string;
  const chunkId = row.chunkId?.trim() as string;
  const sourceRange = row.sourceRange as EditorGraphRagSourceRange;
  const score = finiteNumber(row.score);
  const distance = finiteNumber(row.distance);
  const documentPath = fallbackDocumentPath(row);
  const documentUri = fallbackDocumentUri(row, documentPath);
  const text = (row.text ?? row.label ?? row.chunkId ?? "Connected RAG result")
    .replace(/\s+/g, " ")
    .trim();
  const locator = `${citationId} ${rangeLocator(sourceRange)}`;
  const detail = row.detail?.trim() || `${documentPath} ${locator}`;

  return {
    rank: rankForResult(score, distance),
    order: index,
    result: {
      id: `connected-rag-${citationId}`,
      citationId,
      revisionId,
      chunkId,
      sourceRange,
      documentPath,
      documentUri,
      text: text || chunkId,
      label: labelForRow(row),
      detail,
      locator,
      source: "connected",
      ...(score === undefined ? {} : { score }),
      ...(distance === undefined ? {} : { distance })
    }
  };
};

const toLocalRankedResult = (
  result: WorkspaceRagResult,
  index: number
): RankedRagResult => ({
  rank: 0,
  order: index,
  result: {
    ...result,
    source: "local"
  }
});

const sortRankedResults = (items: readonly RankedRagResult[]): RankedRagResult[] =>
  [...items].sort((left, right) => {
    if (right.rank !== left.rank) return right.rank - left.rank;
    if (left.result.source !== right.result.source) {
      return left.result.source === "local" ? -1 : 1;
    }
    return left.order - right.order;
  });

export const normalizeConnectedRagRows = (
  rows: readonly ConnectedRagRow[]
): { results: MergedRagResult[]; blocked: ConnectedRagBlockedSummary } => {
  const blocked = emptyBlockedSummary();
  const results = rows.flatMap((row, index) => {
    const missingFields = missingRequiredFields(row);
    if (missingFields.length > 0) {
      addBlockedItem(blocked, {
        rowId: rowIdentity(row, index),
        reason: "missing_required_field",
        missingFields
      });
      return [];
    }

    const ranked = toConnectedResult(row, index);
    return ranked ? [ranked.result] : [];
  });

  return { results, blocked };
};

export const mergeWorkspaceRagResults = ({
  localResults,
  connectedRows
}: ConnectedRagMergeInput): ConnectedRagMergeResult => {
  const blocked = emptyBlockedSummary();
  const rankedResults: RankedRagResult[] = [
    ...localResults.map(toLocalRankedResult)
  ];

  connectedRows.forEach((row, index) => {
    const missingFields = missingRequiredFields(row);
    if (missingFields.length > 0) {
      addBlockedItem(blocked, {
        rowId: rowIdentity(row, index),
        reason: "missing_required_field",
        missingFields
      });
      return;
    }

    const ranked = toConnectedResult(row, localResults.length + index);
    if (ranked) rankedResults.push(ranked);
  });

  const seenCitations = new Set<string>();
  const seenChunks = new Set<string>();
  const results: MergedRagResult[] = [];

  for (const ranked of sortRankedResults(rankedResults)) {
    const citationKey = ranked.result.citationId.trim();
    const chunkKey = ranked.result.chunkId.trim();
    if (seenCitations.has(citationKey) || seenChunks.has(chunkKey)) {
      addBlockedItem(blocked, {
        rowId: ranked.result.id,
        reason: "duplicate_result",
        missingFields: []
      });
      continue;
    }
    seenCitations.add(citationKey);
    seenChunks.add(chunkKey);
    results.push(ranked.result);
  }

  return { results, blocked };
};
