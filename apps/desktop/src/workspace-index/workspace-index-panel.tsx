import { Database, PlayCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  mergeWorkspaceRagResults,
  type ConnectedRagBlockedSummary,
  type MergedRagResult
} from "./connected-rag-results";
import type { PostgresRagQueryControllerState } from "./postgres-rag-query-controller";
import type { PostgresRagQueryView } from "./postgres-rag-query-view";
import type { WorkspaceIndexViewModel } from "./workspace-index";

interface WorkspaceIndexPanelProps {
  viewModel: WorkspaceIndexViewModel;
  connectedRagQueryView?: PostgresRagQueryView | null;
  connectedRagQueryState?: PostgresRagQueryControllerState | null;
  query?: string;
  connectedRagOperation?: "idle" | "pending" | "success" | "failure" | "disabled";
  connectedRagOperationMessage?: string;
  connectedRagBackfillOperation?: "idle" | "pending" | "success" | "failure" | "disabled";
  connectedRagBackfillMessage?: string;
  onQueryChange?: (query: string) => void;
  onRunConnectedRagQuery?: () => void;
  onBackfillConnectedRagEmbeddings?: () => void;
}

type SearchRowKind = "local" | "connected" | "symbol" | "reference";

interface SearchRow {
  id: string;
  kind: SearchRowKind;
  label: string;
  detail: string;
  sourceDetail: string;
  metric: string;
}

interface ConnectedRagPanelSummary {
  state: "ready" | "degraded" | "offline";
  label: string;
  detail: string;
  message: string;
  blockedCount: number;
  disabled: boolean;
  degraded: boolean;
}

const disconnectedSummary: ConnectedRagPanelSummary = {
  state: "offline",
  label: "Connected RAG disabled",
  detail: "No connected query view is attached.",
  message: "Connected RAG is unavailable; local citation-backed results remain visible.",
  blockedCount: 0,
  disabled: true,
  degraded: false
};

const controllerSummary = (
  state: PostgresRagQueryControllerState | null | undefined
): ConnectedRagPanelSummary | null => {
  if (!state) return null;
  const summaryState = state.state === "ready" || state.state === "degraded" ? state.state : "offline";
  return {
    state: summaryState,
    label: state.disabled ? "Connected RAG disabled" : "Connected RAG query",
    detail: state.message,
    message: state.message,
    blockedCount: state.commandView?.summary.blockedCount ?? state.merged.blocked.count,
    disabled: state.disabled,
    degraded: state.degraded
  };
};

const rowMatchesQuery = (row: SearchRow, normalizedQuery: string): boolean =>
  `${row.kind} ${row.label} ${row.detail} ${row.sourceDetail} ${row.metric}`
    .toLowerCase()
    .includes(normalizedQuery);

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(3);

const formatRagMetric = (result: MergedRagResult): string => {
  const metrics = [
    result.score === undefined ? "" : `score ${formatNumber(result.score)}`,
    result.distance === undefined ? "" : `distance ${formatNumber(result.distance)}`
  ].filter(Boolean);
  return metrics.join(" / ");
};

const ragSourceDetail = (result: MergedRagResult): string =>
  `${result.documentPath} / ${result.revisionId}/${result.chunkId}`;

const toRagRow = (result: MergedRagResult): SearchRow => ({
  id: result.id,
  kind: result.source,
  label: result.label,
  detail: result.detail,
  sourceDetail: ragSourceDetail(result),
  metric: formatRagMetric(result) || result.locator
});

const summarizeBlockedRows = (
  queryBlockedCount: number,
  mergeBlocked: ConnectedRagBlockedSummary
): string => {
  const total = queryBlockedCount + mergeBlocked.count;
  if (total === 0) return "0 blocked";
  const duplicateCount = mergeBlocked.reasons.duplicate_result ?? 0;
  if (duplicateCount > 0) return `${total} blocked / ${duplicateCount} duplicate`;
  return `${total} blocked`;
};

const connectedSummaryCopy = (summary: ConnectedRagPanelSummary): string => {
  if (!summary.detail || summary.detail === summary.message) return summary.message;
  return `${summary.message} ${summary.detail}`;
};

const toolPanelClassName = "flex min-h-0 flex-col gap-4 text-sm";
const summaryClassName = "grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-4 gap-y-1.5 text-xs";
const summaryLabelClassName = "block text-xs text-muted-foreground";
const summaryValueClassName = "block min-w-0 truncate text-sm text-foreground";
const searchClassName = "flex min-w-0 flex-col gap-1 text-xs text-muted-foreground";
const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";
const resultListClassName = "m-0 flex list-none flex-col gap-0 p-0";
const resultRowClassName = "flex items-center gap-2 border-t border-white/35 py-2 text-xs first:border-t-0 first:pt-0";
const resultKindClassName = "flex-none text-xs font-semibold uppercase text-primary";
const resultMainClassName = "flex min-w-0 flex-1 flex-col gap-1";
const resultCodeClassName = "min-w-0 truncate text-xs text-muted-foreground";

export const WorkspaceIndexPanel = ({
  viewModel,
  connectedRagQueryView = null,
  connectedRagQueryState = null,
  query,
  connectedRagOperation = "idle",
  connectedRagOperationMessage,
  connectedRagBackfillOperation = "disabled",
  connectedRagBackfillMessage,
  onQueryChange,
  onRunConnectedRagQuery,
  onBackfillConnectedRagEmbeddings
}: WorkspaceIndexPanelProps) => {
  const [localQuery, setLocalQuery] = useState("");
  const activeQuery = query ?? localQuery;
  const updateQuery = (nextQuery: string) => {
    if (onQueryChange) {
      onQueryChange(nextQuery);
      return;
    }
    setLocalQuery(nextQuery);
  };
  const runDisabled = !onRunConnectedRagQuery
    || connectedRagOperation === "pending"
    || connectedRagQueryState?.disabled === true;
  const backfillDisabled = !onBackfillConnectedRagEmbeddings
    || connectedRagBackfillOperation === "pending"
    || connectedRagBackfillOperation === "disabled";
  const effectiveConnectedView = connectedRagQueryState?.commandView ?? connectedRagQueryView;
  const mergedRag = useMemo(() => mergeWorkspaceRagResults({
    localResults: viewModel.ragResults,
    connectedRows: effectiveConnectedView?.connectedRows ?? []
  }), [effectiveConnectedView?.connectedRows, viewModel.ragResults]);
  const connectedSummary = effectiveConnectedView?.summary
    ?? controllerSummary(connectedRagQueryState)
    ?? disconnectedSummary;
  const blockedSummary = summarizeBlockedRows(
    connectedSummary.blockedCount,
    mergedRag.blocked
  );
  const rows = useMemo(() => {
    const normalizedQuery = activeQuery.trim().toLowerCase();
    const symbolRows = viewModel.symbols.map((symbol) => ({
      id: `symbol-${symbol.id}`,
      kind: "symbol" as const,
      label: symbol.label,
      detail: `${symbol.documentPath}:L${symbol.line}`,
      sourceDetail: symbol.kind,
      metric: symbol.duplicate ? "duplicate" : "indexed"
    }));
    const referenceRows = viewModel.references.map((reference) => ({
      id: `reference-${reference.id}`,
      kind: "reference" as const,
      label: reference.target,
      detail: `${reference.field} L${reference.line}`,
      sourceDetail: reference.sourcePath,
      metric: reference.status
    }));
    const ragRows = mergedRag.results.map(toRagRow);
    const allRows = [...ragRows, ...symbolRows, ...referenceRows];
    if (!normalizedQuery) return allRows.slice(0, 8);
    return allRows.filter((row) => rowMatchesQuery(row, normalizedQuery)).slice(0, 12);
  }, [activeQuery, mergedRag.results, viewModel.references, viewModel.symbols]);

  return (
    <div className={toolPanelClassName}>
      <div className={summaryClassName}>
        {viewModel.badges.slice(0, 4).map((badge) => (
          <div key={badge.label} className="min-w-0" data-state={badge.tone}><span className={summaryLabelClassName}>{badge.label}</span><strong className={summaryValueClassName}>{badge.value}</strong></div>
        ))}
      </div>
      <label className={searchClassName}>
        <Search size={14} />
        <Input
          inputSize="xs"
          value={activeQuery}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search citation-backed RAG, symbols, references"
          aria-label="RAG search query"
        />
        {onRunConnectedRagQuery ? (
          <Button
            type="button"
            variant="surface"
            size="control"
            disabled={runDisabled}
            data-state={connectedRagOperation}
            onClick={onRunConnectedRagQuery}
            title={connectedRagOperationMessage ?? connectedSummary.message}
          >
            <PlayCircle size={13} />
            <span>{connectedRagOperation === "pending" ? "Running" : "Run"}</span>
          </Button>
        ) : null}
        {onBackfillConnectedRagEmbeddings ? (
          <Button
            type="button"
            variant="surface"
            size="control"
            disabled={backfillDisabled}
            data-state={connectedRagBackfillOperation}
            onClick={onBackfillConnectedRagEmbeddings}
            title={connectedRagBackfillMessage ?? "Backfill local RAG chunk embeddings to Postgres"}
          >
            <Database size={13} />
            <span>{connectedRagBackfillOperation === "pending" ? "Backfill" : "Index"}</span>
          </Button>
        ) : null}
      </label>
      <p className={emptyCopyClassName}>{viewModel.message}</p>
      <p className={emptyCopyClassName}>{viewModel.ragGate.message}</p>
      <div
        className="border-t border-white/35 py-2 text-xs"
        data-disabled={connectedSummary.disabled}
        data-state={connectedSummary.state}
      >
        <span>{connectedSummary.state}</span>
        <strong>{connectedSummary.label}</strong>
        <code>{blockedSummary}</code>
        <small title={connectedSummary.detail}>{connectedSummaryCopy(connectedSummary)}</small>
      </div>
      {connectedRagOperationMessage ? (
        <p className={emptyCopyClassName}>{connectedRagOperationMessage}</p>
      ) : null}
      {connectedRagBackfillMessage ? (
        <p className={emptyCopyClassName}>{connectedRagBackfillMessage}</p>
      ) : null}
      <div className={resultListClassName} role="list">
        {rows.length > 0 ? rows.map((row) => (
          <div
            key={row.id}
            className={resultRowClassName}
            data-kind={row.kind}
            role="listitem"
          >
            <span className={resultKindClassName}>{row.kind}</span>
            <div className={resultMainClassName}>
              <strong className="min-w-0 truncate" title={row.label}>{row.label}</strong>
              <small title={row.sourceDetail}>{row.sourceDetail}</small>
            </div>
            <code className={resultCodeClassName}>{row.metric}</code>
            <code className={resultCodeClassName}>{row.detail}</code>
          </div>
        )) : <p className={emptyCopyClassName}>No matches.</p>}
      </div>
    </div>
  );
};

