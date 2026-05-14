import { FileCode2, Files, HardDrive, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import type { LocalStoreStatus } from "../desktop-contracts";
import type {
  LocalStoreOperation,
  LocalSnapshotState,
  LocalSyncState,
  PersistOperationState,
  WorkspaceIngestState,
} from "../desktop-types";
import type { DesktopReactionIntelligenceJobBuildResult } from "../desktop-reaction-intelligence-job";
import type { DesktopReactionIntelligenceJobState } from "../desktop-reaction-intelligence-job-controller";
import { buildLocalSyncResultRows } from "../desktop-local-sync-view";
import type { DesktopSemanticPreview } from "../desktop-semantic-preview";
import type { DesktopWorkspaceSymbolIndexSummary } from "../desktop-workspace-symbol-index";
import {
  formatLocalSyncCounts,
  formatPostgresValue,
  getLocalStoreFields,
  redactSensitiveRuntimeText,
  summarizeLocalId,
} from "../desktop-utils";

// ---------------------------------------------------------------------------
// LocalStoreButton
// ---------------------------------------------------------------------------

export const LocalStoreButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof RefreshCw;
  operation: LocalStoreOperation;
  activeOperation: LocalStoreOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <Button variant="outline" size="sm" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </Button>
  );
};

// ---------------------------------------------------------------------------
// SemanticPreviewPanel
// ---------------------------------------------------------------------------

export const SemanticPreviewPanel = ({
  preview,
  workspaceSymbolIndexState,
  workspaceSymbolIndexMessage,
  workspaceSymbolIndexSummary
}: {
  preview: DesktopSemanticPreview;
  workspaceSymbolIndexState: PersistOperationState;
  workspaceSymbolIndexMessage: string;
  workspaceSymbolIndexSummary: DesktopWorkspaceSymbolIndexSummary | null;
}) => (
  <div className="desktop-preview-surface">
    <div className="desktop-document-preview" data-state={preview.state}>
      <p className="desktop-preview-kicker">{preview.message}</p>
      <dl>
        <div><dt>Preview</dt><dd>{preview.state}</dd></div>
        <div><dt>Compiled</dt><dd>{new Date(preview.compiledAt).toLocaleTimeString()}</dd></div>
        <div><dt>Workspace index</dt><dd>{workspaceSymbolIndexState}</dd></div>
        <div><dt>Documents</dt><dd>{workspaceSymbolIndexSummary?.indexedFiles ?? 0} indexed</dd></div>
      </dl>
      <p>{workspaceSymbolIndexMessage}</p>
      {preview.state === "ready" ? (
        <div
          className="desktop-semantic-preview-html"
          // HTML is produced by @chemd/renderer-html, which escapes source text.
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      ) : (
        <p>{preview.reason ?? "preview_unavailable"}</p>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// LocalStorePanel
// ---------------------------------------------------------------------------

export const LocalStorePanel = ({
  status,
  operation,
  snapshotState,
  syncState,
  reactionIntelligenceJobBuild,
  reactionIntelligenceJobState,
  workspaceIngestState,
  disabledReason,
  syncDisabledReason,
  workspaceIngestDisabledReason,
  errorMessage,
  onRefresh,
  onSave,
  onSync,
  onRunReactionIntelligenceJob,
  onRunWorkspaceIngest
}: {
  status: LocalStoreStatus;
  operation: LocalStoreOperation | null;
  snapshotState: LocalSnapshotState;
  syncState: LocalSyncState;
  reactionIntelligenceJobBuild: DesktopReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobState: DesktopReactionIntelligenceJobState;
  workspaceIngestState: WorkspaceIngestState;
  disabledReason: string | null;
  syncDisabledReason: string | null;
  workspaceIngestDisabledReason: string | null;
  errorMessage: string | null;
  onRefresh: () => void;
  onSave: () => void;
  onSync: () => void;
  onRunReactionIntelligenceJob: () => void;
  onRunWorkspaceIngest: () => void;
}) => {
  const busy = operation !== null;
  const saveDisabled = busy || disabledReason !== null || !status.available;
  const syncDisabled = busy || syncDisabledReason !== null;
  const intelligenceBusy = reactionIntelligenceJobState.status === "running";
  const intelligenceDisabled = intelligenceBusy || reactionIntelligenceJobBuild.state !== "ready" || !status.available;
  const ingestBusy = workspaceIngestState.state === "pending";
  const ingestDisabled = ingestBusy || workspaceIngestDisabledReason !== null;
  const unavailableMessage = status.available
    ? null
    : "Local Store is unavailable. Refresh status before relying on the offline outbox.";
  const syncRows = buildLocalSyncResultRows(syncState);

  return (
    <section className="desktop-local-store-panel" aria-label="Offline Local Store">
      <div className="desktop-local-store-heading">
        <div className="desktop-agent-subhead"><HardDrive size={14} /><span>Offline Local Store</span></div>
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <p className="desktop-local-store-copy">
        Local Store writes the current Graph/RAG/Agent snapshot to a local JSON cache/outbox. External or Managed Postgres remains the sync target after reconnect.
      </p>
      <div className="desktop-workspace-ingest-status" data-state={workspaceIngestState.state} aria-live="polite">
        <div className="desktop-workspace-ingest-header">
          <div className="desktop-agent-subhead"><Files size={14} /><span>Workspace Ingest</span></div>
          <Button
            size="sm"
            disabled={ingestDisabled}
            aria-busy={ingestBusy}
            onClick={onRunWorkspaceIngest}
          >
            {ingestBusy ? <RefreshCw size={14} /> : <FileCode2 size={14} />}
            <span>{ingestBusy ? "Scanning" : "Scan/Ingest current workspace"}</span>
          </Button>
        </div>
        <p>{workspaceIngestState.message}</p>
        {workspaceIngestDisabledReason ? (
          <p className="desktop-local-store-message" data-tone="warning">{workspaceIngestDisabledReason}</p>
        ) : null}
        {workspaceIngestState.summary ? (
          <dl className="desktop-workspace-ingest-summary">
            <div><dt>Total</dt><dd>{workspaceIngestState.summary.totalCount}</dd></div>
            <div><dt>Pending</dt><dd>{workspaceIngestState.summary.pendingCount}</dd></div>
            <div><dt>Skipped</dt><dd>{workspaceIngestState.summary.skippedCount}</dd></div>
            <div><dt>Failed</dt><dd>{workspaceIngestState.summary.failedCount}</dd></div>
            <div><dt>Retryable</dt><dd>{workspaceIngestState.summary.retryableCount}</dd></div>
          </dl>
        ) : null}
        {workspaceIngestState.summary?.errors.length ? (
          <ul className="desktop-workspace-ingest-errors" aria-label="Workspace ingest failures">
            {workspaceIngestState.summary.errors.slice(0, 4).map((error) => (
              <li key={error.queueId}>
                <code title={error.documentPath}>{error.documentPath}</code>
                <span title={error.errorSummary}>{error.errorSummary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="desktop-reaction-intelligence-status" data-state={reactionIntelligenceJobState.status} aria-live="polite">
        <div className="desktop-workspace-ingest-header">
          <div className="desktop-agent-subhead"><Sparkles size={14} /><span>Reaction Intelligence</span></div>
          <Button
            size="sm"
            disabled={intelligenceDisabled}
            aria-busy={intelligenceBusy}
            onClick={onRunReactionIntelligenceJob}
          >
            {intelligenceBusy ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            <span>{intelligenceBusy ? "Running" : "Run intelligence job"}</span>
          </Button>
        </div>
        <p>{reactionIntelligenceJobBuild.message}</p>
        <div className="desktop-persist-status-row">
          <span>{reactionIntelligenceJobState.status}</span>
          <p>{reactionIntelligenceJobState.message}</p>
        </div>
        {reactionIntelligenceJobState.artifactSummary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Artifact</dt><dd title={reactionIntelligenceJobState.artifactSummary.artifactId}>{summarizeLocalId(reactionIntelligenceJobState.artifactSummary.artifactId)}</dd></div>
            <div><dt>Edges</dt><dd>{reactionIntelligenceJobState.artifactSummary.similarityEdgeCount}</dd></div>
            <div><dt>Features</dt><dd>{reactionIntelligenceJobState.artifactSummary.reactionFeatureCount}</dd></div>
          </dl>
        ) : null}
        {reactionIntelligenceJobState.error ? (
          <p className="desktop-local-store-message" data-tone="danger">{reactionIntelligenceJobState.error}</p>
        ) : null}
        {reactionIntelligenceJobState.logTail.length > 0 ? (
          <div className="desktop-sidecar-log" aria-label="Reaction intelligence log tail">
            {reactionIntelligenceJobState.logTail.slice(-4).map((line, index) => (
              <code key={`${index}-${line}`}>{line}</code>
            ))}
          </div>
        ) : null}
      </div>
      <div className="desktop-local-store-actions">
        <LocalStoreButton
          label="Refresh Local"
          loadingLabel="Refreshing"
          icon={RefreshCw}
          operation="refresh"
          activeOperation={operation}
          disabled={busy}
          onClick={onRefresh}
        />
        <LocalStoreButton
          label="Save Local Snapshot"
          loadingLabel="Saving"
          icon={HardDrive}
          operation="save"
          activeOperation={operation}
          disabled={saveDisabled}
          onClick={onSave}
        />
        <LocalStoreButton
          label="Sync Pending"
          loadingLabel="Syncing"
          icon={UploadCloud}
          operation="sync"
          activeOperation={operation}
          disabled={syncDisabled}
          onClick={onSync}
        />
      </div>
      {unavailableMessage ? <p className="desktop-local-store-message" data-tone="warning">{unavailableMessage}</p> : null}
      {disabledReason ? <p className="desktop-local-store-message" data-tone="warning">{disabledReason}</p> : null}
      {syncDisabledReason ? <p className="desktop-local-store-message" data-tone="warning">{syncDisabledReason}</p> : null}
      {errorMessage ? <p className="desktop-local-store-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      <div className="desktop-local-snapshot-status" data-state={snapshotState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{snapshotState.state}</span>
          <p>{snapshotState.message}</p>
        </div>
        {snapshotState.summary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Local id</dt><dd title={snapshotState.summary.localId}>{summarizeLocalId(snapshotState.summary.localId)}</dd></div>
            <div><dt>Pending</dt><dd>{snapshotState.summary.pendingCount}</dd></div>
            <div><dt>Idempotency</dt><dd title={snapshotState.summary.idempotencyKey}>{summarizeLocalId(snapshotState.summary.idempotencyKey)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="desktop-local-sync-status" data-state={syncState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{syncState.state}</span>
          <p>{syncState.message}</p>
        </div>
        {syncState.summary ? (
          <>
            <dl className="desktop-persist-summary">
              <div><dt>Counts</dt><dd>{formatLocalSyncCounts(syncState.summary)}</dd></div>
              <div><dt>Target</dt><dd>{syncState.summary.target.kind}</dd></div>
              <div><dt>Source</dt><dd title={redactSensitiveRuntimeText(syncState.summary.target.source)}>{redactSensitiveRuntimeText(syncState.summary.target.source)}</dd></div>
              <div><dt>Host</dt><dd>{formatPostgresValue(syncState.summary.target.host)}</dd></div>
              <div><dt>Database</dt><dd>{formatPostgresValue(syncState.summary.target.database)}</dd></div>
              <div><dt>User</dt><dd>{formatPostgresValue(syncState.summary.target.user)}</dd></div>
            </dl>
            {syncRows.length > 0 ? (
              <ul className="desktop-local-sync-results" aria-label="Local outbox sync results">
                {syncRows.slice(0, 6).map((row) => (
                  <li key={row.rowId} data-category={row.category}>
                    <span>{row.conflict ? "conflict" : row.status}</span>
                    <code title={row.localId}>{summarizeLocalId(row.localId)}</code>
                    <strong title={row.message}>{row.message}</strong>
                    <small title={row.graphSnapshotId ?? row.idempotencyKey}>
                      {row.graphSnapshotId ? summarizeLocalId(row.graphSnapshotId) : summarizeLocalId(row.idempotencyKey)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <dl className="desktop-local-store-fields">
        {getLocalStoreFields(status).map(([label, value]) => (
          <div key={label} className={label === "Storage path" ? "desktop-local-store-field-wide" : undefined}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
