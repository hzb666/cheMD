import type { EditorGraphRagSourceRange } from "@chemd/language-service";

import type {
  PostgresRagQueryResult,
  PostgresRagQueryResultItem,
  RuntimeJsonObject,
  RuntimeJsonValue
} from "../desktop-contracts";
import type { DesktopConnectedRagRow } from "./desktop-connected-rag-results";

export type DesktopPostgresRagQueryAdapterBlockedReason =
  | "missing_citation_id"
  | "missing_source_range";

export interface DesktopPostgresRagQueryBlockedItem {
  rowId: string;
  chunkId: string;
  revisionId: string;
  reasons: DesktopPostgresRagQueryAdapterBlockedReason[];
}

export interface DesktopPostgresRagQueryAdapterSummary {
  blockedCount: number;
  reasons: Partial<Record<DesktopPostgresRagQueryAdapterBlockedReason, number>>;
  items: DesktopPostgresRagQueryBlockedItem[];
}

export interface DesktopPostgresRagQueryCommandSummary {
  state: PostgresRagQueryResult["state"];
  label: string;
  detail: string;
  blockedCount: number;
}

export interface DesktopPostgresRagQueryViewSummary {
  state: PostgresRagQueryResult["state"];
  label: string;
  detail: string;
  blockedCount: number;
  disabled: boolean;
  degraded: boolean;
  message: string;
  command: DesktopPostgresRagQueryCommandSummary;
  adapter: DesktopPostgresRagQueryAdapterSummary;
}

export interface DesktopPostgresRagQueryView {
  connectedRows: DesktopConnectedRagRow[];
  summary: DesktopPostgresRagQueryViewSummary;
}

export interface DesktopPostgresRagQueryViewOptions {
  sanitizeDetail?: (detail: string) => string;
}

const nonBlank = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const isJsonObject = (value: RuntimeJsonValue | undefined): value is RuntimeJsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (
  record: RuntimeJsonObject | undefined,
  field: string
): string | undefined => {
  const value = record?.[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const numberField = (
  record: RuntimeJsonObject | undefined,
  field: string
): number | undefined => {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const toSourceRange = (
  value: RuntimeJsonObject
): EditorGraphRagSourceRange | null => {
  const startLine = numberField(value, "startLine");
  const endLine = numberField(value, "endLine");
  const start = numberField(value, "start");
  const end = numberField(value, "end");
  const startColumn = numberField(value, "startColumn");
  const endColumn = numberField(value, "endColumn");

  if (startLine === undefined || endLine === undefined) {
    return null;
  }

  return {
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
    startLine,
    ...(startColumn === undefined ? {} : { startColumn }),
    endLine,
    ...(endColumn === undefined ? {} : { endColumn })
  };
};

const citationJson = (item: PostgresRagQueryResultItem): RuntimeJsonObject | undefined =>
  isJsonObject(item.citation.citation) ? item.citation.citation : undefined;

const citationIdForItem = (item: PostgresRagQueryResultItem): string | undefined => {
  const citation = citationJson(item);
  return stringField(citation, "citationId") ?? stringField(citation, "id");
};

const sourceUriForItem = (item: PostgresRagQueryResultItem): string | undefined => {
  const citation = citationJson(item);
  return item.citation.sourceUri?.trim()
    || stringField(citation, "documentUri")
    || stringField(citation, "sourceUri");
};

const scoreForItem = (item: PostgresRagQueryResultItem): number | undefined =>
  numberField(item.metadata, "score")
  ?? numberField(item.metadata, "similarity")
  ?? numberField(item.citation.quality, "score");

const rowIdForItem = (item: PostgresRagQueryResultItem, index: number): string =>
  citationIdForItem(item) ?? (item.chunkId.trim() || `postgres-rag-query-${index + 1}`);

const addBlockedItem = (
  summary: DesktopPostgresRagQueryAdapterSummary,
  item: DesktopPostgresRagQueryBlockedItem
): void => {
  summary.blockedCount += 1;
  item.reasons.forEach((reason) => {
    summary.reasons[reason] = (summary.reasons[reason] ?? 0) + 1;
  });
  summary.items.push(item);
};

const blockedItemForResult = (
  item: PostgresRagQueryResultItem,
  index: number,
  reasons: DesktopPostgresRagQueryAdapterBlockedReason[]
): DesktopPostgresRagQueryBlockedItem => ({
  rowId: rowIdForItem(item, index),
  chunkId: item.chunkId,
  revisionId: item.revisionId,
  reasons
});

export const sanitizePostgresRagQueryDetail = (detail: string): string =>
  detail
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+(@)/giu, "$1***$2")
    .replace(/(\bpassword\s*=\s*)[^\s;]+/giu, "$1***")
    .replace(/(\bpassword["']?\s*[:=]\s*["']?)[^"',\s;}]+/giu, "$1***");

const commandSummary = (
  result: PostgresRagQueryResult,
  sanitizeDetail: (detail: string) => string
): DesktopPostgresRagQueryCommandSummary => ({
  state: result.state,
  label: result.label,
  detail: sanitizeDetail(result.detail),
  blockedCount: result.blockedCount
});

const messageForSummary = (
  command: DesktopPostgresRagQueryCommandSummary,
  adapterBlockedCount: number
): string => {
  if (command.state === "offline") {
    return command.detail
      ? `Postgres RAG is offline: ${command.detail}`
      : "Postgres RAG is offline.";
  }
  if (command.state === "degraded") {
    return command.detail
      ? `Postgres RAG is degraded: ${command.detail}`
      : "Postgres RAG is degraded.";
  }
  if (adapterBlockedCount > 0) {
    return `${adapterBlockedCount} Postgres RAG result(s) were hidden because citation data is incomplete.`;
  }
  return command.label;
};

const toConnectedRow = (
  item: PostgresRagQueryResultItem,
  index: number,
  adapter: DesktopPostgresRagQueryAdapterSummary
): DesktopConnectedRagRow | null => {
  const citationId = citationIdForItem(item);
  const sourceRange = toSourceRange(item.citation.sourceRange);
  const reasons: DesktopPostgresRagQueryAdapterBlockedReason[] = [];

  if (!nonBlank(citationId)) {
    reasons.push("missing_citation_id");
  }
  if (!sourceRange) {
    reasons.push("missing_source_range");
  }

  if (reasons.length > 0) {
    addBlockedItem(adapter, blockedItemForResult(item, index, reasons));
    return null;
  }

  const sourceUri = sourceUriForItem(item);
  const score = scoreForItem(item);
  return {
    rowId: rowIdForItem(item, index),
    citationId,
    revisionId: item.revisionId,
    chunkId: item.chunkId,
    sourceRange,
    documentPath: sourceUri,
    documentUri: sourceUri,
    sourceUri,
    text: item.text,
    label: item.text,
    detail: item.citation.locator,
    ...(score === undefined ? {} : { score }),
    distance: item.distance
  };
};

export const buildDesktopPostgresRagQueryView = (
  result: PostgresRagQueryResult,
  options: DesktopPostgresRagQueryViewOptions = {}
): DesktopPostgresRagQueryView => {
  const sanitizeDetail = options.sanitizeDetail ?? sanitizePostgresRagQueryDetail;
  const adapter: DesktopPostgresRagQueryAdapterSummary = {
    blockedCount: 0,
    reasons: {},
    items: []
  };
  const connectedRows = result.results.flatMap((item, index) => {
    const row = toConnectedRow(item, index, adapter);
    return row ? [row] : [];
  });
  const command = commandSummary(result, sanitizeDetail);
  const totalBlockedCount = command.blockedCount + adapter.blockedCount;

  return {
    connectedRows,
    summary: {
      state: command.state,
      label: command.label,
      detail: command.detail,
      blockedCount: totalBlockedCount,
      disabled: command.state === "offline",
      degraded: command.state === "degraded",
      message: messageForSummary(command, adapter.blockedCount),
      command,
      adapter
    }
  };
};
