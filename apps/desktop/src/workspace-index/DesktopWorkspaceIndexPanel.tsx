import { Database, PlayCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  mergeDesktopWorkspaceRagResults,
  type DesktopConnectedRagBlockedSummary,
  type DesktopMergedRagResult
} from "./desktop-connected-rag-results";
import type { DesktopPostgresRagQueryControllerState } from "./desktop-postgres-rag-query-controller";
import type { DesktopPostgresRagQueryView } from "./desktop-postgres-rag-query-view";
import type { DesktopWorkspaceIndexViewModel } from "./desktop-workspace-index";

interface WorkspaceIndexPanelProps {
  viewModel: DesktopWorkspaceIndexViewModel;
  connectedRagQueryView?: DesktopPostgresRagQueryView | null;
  connectedRagQueryState?: DesktopPostgresRagQueryControllerState | null;
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
  state: DesktopPostgresRagQueryControllerState | null | undefined
): ConnectedRagPanelSummary | null => {
  if (!state) return null;
  return {
    state: state.state === "ready" ? "ready" : state.state === "degraded" ? "degraded" : "offline",
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

const formatRagMetric = (result: DesktopMergedRagResult): string => {
  const metrics = [
    result.score === undefined ? "" : `score ${formatNumber(result.score)}`,
    result.distance === undefined ? "" : `distance ${formatNumber(result.distance)}`
  ].filter(Boolean);
  return metrics.join(" / ");
};

const ragSourceDetail = (result: DesktopMergedRagResult): string =>
  `${result.documentPath} / ${result.revisionId}/${result.chunkId}`;

const toRagRow = (result: DesktopMergedRagResult): SearchRow => ({
  id: result.id,
  kind: result.source,
  label: result.label,
  detail: result.detail,
  sourceDetail: ragSourceDetail(result),
  metric: formatRagMetric(result) || result.locator
});

const summarizeBlockedRows = (
  queryBlockedCount: number,
  mergeBlocked: DesktopConnectedRagBlockedSummary
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

export const DesktopWorkspaceIndexPanel = ({
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
  const mergedRag = useMemo(() => mergeDesktopWorkspaceRagResults({
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
    <div className="desktop-tool-panel">
      <div className="desktop-graph-summary">
        {viewModel.badges.slice(0, 4).map((badge) => (
          <div key={badge.label} data-state={badge.tone}><span>{badge.label}</span><strong>{badge.value}</strong></div>
        ))}
      </div>
      <label className="desktop-tool-search">
        <Search size={14} />
        <input
          value={activeQuery}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search citation-backed RAG, symbols, references"
          aria-label="RAG search query"
        />
        {onRunConnectedRagQuery ? (
          <button
            type="button"
            className="desktop-tool-search-action"
            disabled={runDisabled}
            data-state={connectedRagOperation}
            onClick={onRunConnectedRagQuery}
            title={connectedRagOperationMessage ?? connectedSummary.message}
          >
            <PlayCircle size={13} />
            <span>{connectedRagOperation === "pending" ? "Running" : "Run"}</span>
          </button>
        ) : null}
        {onBackfillConnectedRagEmbeddings ? (
          <button
            type="button"
            className="desktop-tool-search-action"
            disabled={backfillDisabled}
            data-state={connectedRagBackfillOperation}
            onClick={onBackfillConnectedRagEmbeddings}
            title={connectedRagBackfillMessage ?? "Backfill local RAG chunk embeddings to Postgres"}
          >
            <Database size={13} />
            <span>{connectedRagBackfillOperation === "pending" ? "Backfill" : "Index"}</span>
          </button>
        ) : null}
      </label>
      <p className="desktop-empty-copy">{viewModel.message}</p>
      <p className="desktop-empty-copy">{viewModel.ragGate.message}</p>
      <div
        className="desktop-rag-connected-status"
        data-disabled={connectedSummary.disabled}
        data-state={connectedSummary.state}
      >
        <span>{connectedSummary.state}</span>
        <strong>{connectedSummary.label}</strong>
        <code>{blockedSummary}</code>
        <small title={connectedSummary.detail}>{connectedSummaryCopy(connectedSummary)}</small>
      </div>
      {connectedRagOperationMessage ? (
        <p className="desktop-empty-copy">{connectedRagOperationMessage}</p>
      ) : null}
      {connectedRagBackfillMessage ? (
        <p className="desktop-empty-copy">{connectedRagBackfillMessage}</p>
      ) : null}
      <div className="desktop-tool-result-list" role="list">
        {rows.length > 0 ? rows.map((row) => (
          <div
            key={row.id}
            className="desktop-tool-result-row"
            data-kind={row.kind}
            role="listitem"
          >
            <span>{row.kind}</span>
            <div className="desktop-tool-result-main">
              <strong title={row.label}>{row.label}</strong>
              <small title={row.sourceDetail}>{row.sourceDetail}</small>
            </div>
            <code className="desktop-tool-result-metric">{row.metric}</code>
            <code className="desktop-tool-result-detail">{row.detail}</code>
          </div>
        )) : <p className="desktop-empty-copy">No matches.</p>}
      </div>
    </div>
  );
};

