import { FileCode2, Files, HardDrive, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import type { LocalStoreStatus } from "../../contracts";
import type {
  LocalStoreOperation,
  LocalSnapshotState,
  LocalSyncState,
  PersistOperationState,
  WorkspaceIngestState,
} from "../../types";
import type { ReactionIntelligenceJobBuildResult } from "../reaction-intelligence/job";
import type { ReactionIntelligenceJobState } from "../reaction-intelligence/job-controller";
import { buildLocalSyncResultRows } from "../local-store/sync-view";
import type { SemanticPreview } from "../preview/semantic-preview";
import type { WorkspaceSymbolIndexSummary } from "../../workspace-index/symbol-index";
import {
  formatLocalSyncCounts,
  formatPostgresValue,
  getLocalStoreFields,
  redactSensitiveRuntimeText,
  summarizeLocalId,
} from "../../utils";

const panelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/15 p-3 text-sm shadow-none";
const headingClassName = "flex items-center justify-between gap-2";
const subheadClassName = "flex items-center gap-2 text-xs font-medium text-muted-foreground";
const actionRowClassName = "flex flex-wrap items-center gap-2";
const messageClassName = "m-0 text-xs leading-relaxed text-muted-foreground data-[tone=danger]:text-destructive data-[tone=warning]:text-warning";
const cardClassName = "rounded-xl border border-white/35 bg-white/18 p-3";
const statusRowClassName = "flex items-center gap-2";
const statusPillClassName = "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary";
const statusMessageClassName = "m-0 min-w-0 flex-1 truncate text-xs text-muted-foreground";
const summaryGridClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 text-xs";
const summaryCellClassName = "min-w-0 rounded-lg border border-white/35 bg-white/18 px-2.5 py-2";
const summaryTermClassName = "m-0 truncate text-xs font-medium uppercase text-muted-foreground";
const summaryValueClassName = "mt-0.5 truncate font-mono text-xs text-foreground";
const listClassName = "m-0 flex list-none flex-col gap-2 p-0";
const listItemClassName = "min-w-0 rounded-xl border border-white/35 bg-white/18 p-2 text-xs";
const logClassName = "flex max-h-40 min-h-20 flex-col gap-1 overflow-auto rounded-xl border bg-slate-950/90 p-3 font-mono text-xs text-slate-100";
const fieldsClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 text-xs";
const fieldWideClassName = "col-span-full";
const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";

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
  preview: SemanticPreview;
  workspaceSymbolIndexState: PersistOperationState;
  workspaceSymbolIndexMessage: string;
  workspaceSymbolIndexSummary: WorkspaceSymbolIndexSummary | null;
}) => (
  <div className="min-h-0 overflow-auto rounded-xl border bg-white/90 p-3 shadow-sm">
    <div className="flex min-h-0 flex-col gap-3 text-sm" data-state={preview.state}>
      <p className={emptyCopyClassName}>{preview.message}</p>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 text-xs">
        <div className="rounded-lg border bg-white p-2"><dt className="m-0 truncate text-xs text-muted-foreground">Preview</dt><dd className="m-0 truncate">{preview.state}</dd></div>
        <div className="rounded-lg border bg-white p-2"><dt className="m-0 truncate text-xs text-muted-foreground">Compiled</dt><dd className="m-0 truncate">{new Date(preview.compiledAt).toLocaleTimeString()}</dd></div>
        <div className="rounded-lg border bg-white p-2"><dt className="m-0 truncate text-xs text-muted-foreground">Workspace index</dt><dd className="m-0 truncate">{workspaceSymbolIndexState}</dd></div>
        <div className="rounded-lg border bg-white p-2"><dt className="m-0 truncate text-xs text-muted-foreground">Documents</dt><dd className="m-0 truncate">{workspaceSymbolIndexSummary?.indexedFiles ?? 0} indexed</dd></div>
      </dl>
      <p>{workspaceSymbolIndexMessage}</p>
      {preview.state === "ready" ? (
        <div
          className="overflow-auto rounded-xl border bg-white p-3"
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
  reactionIntelligenceJobBuild: ReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobState: ReactionIntelligenceJobState;
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
    <section className={panelClassName} aria-label="Offline Local Store">
      <div className={headingClassName}>
        <div className={subheadClassName}><HardDrive size={14} /><span>Offline Local Store</span></div>
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <p className={emptyCopyClassName}>
        Local Store writes the current Graph/RAG/Agent snapshot to a local JSON cache/outbox. External or Managed Postgres remains the sync target after reconnect.
      </p>
      <div className={cardClassName} data-state={workspaceIngestState.state} aria-live="polite">
        <div className={headingClassName}>
          <div className={subheadClassName}><Files size={14} /><span>Workspace Ingest</span></div>
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
        <p className={statusMessageClassName}>{workspaceIngestState.message}</p>
        {workspaceIngestDisabledReason ? (
          <p className={messageClassName} data-tone="warning">{workspaceIngestDisabledReason}</p>
        ) : null}
        {workspaceIngestState.summary ? (
          <dl className={summaryGridClassName}>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Total</dt><dd className={summaryValueClassName}>{workspaceIngestState.summary.totalCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Pending</dt><dd className={summaryValueClassName}>{workspaceIngestState.summary.pendingCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Skipped</dt><dd className={summaryValueClassName}>{workspaceIngestState.summary.skippedCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Failed</dt><dd className={summaryValueClassName}>{workspaceIngestState.summary.failedCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Retryable</dt><dd className={summaryValueClassName}>{workspaceIngestState.summary.retryableCount}</dd></div>
          </dl>
        ) : null}
        {workspaceIngestState.summary?.errors.length ? (
          <ul className={listClassName} aria-label="Workspace ingest failures">
            {workspaceIngestState.summary.errors.slice(0, 4).map((error) => (
              <li key={error.queueId} className={listItemClassName}>
                <code className="truncate text-muted-foreground" title={error.documentPath}>{error.documentPath}</code>
                <span className="min-w-0 truncate text-muted-foreground" title={error.errorSummary}>{error.errorSummary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className={cardClassName} data-state={reactionIntelligenceJobState.status} aria-live="polite">
        <div className={headingClassName}>
          <div className={subheadClassName}><Sparkles size={14} /><span>Reaction Intelligence</span></div>
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
        <p className={statusMessageClassName}>{reactionIntelligenceJobBuild.message}</p>
        <div className={statusRowClassName}>
          <span className={statusPillClassName}>{reactionIntelligenceJobState.status}</span>
          <p className={statusMessageClassName}>{reactionIntelligenceJobState.message}</p>
        </div>
        {reactionIntelligenceJobState.artifactSummary ? (
          <dl className={summaryGridClassName}>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Artifact</dt><dd className={summaryValueClassName} title={reactionIntelligenceJobState.artifactSummary.artifactId}>{summarizeLocalId(reactionIntelligenceJobState.artifactSummary.artifactId)}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Edges</dt><dd className={summaryValueClassName}>{reactionIntelligenceJobState.artifactSummary.similarityEdgeCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Features</dt><dd className={summaryValueClassName}>{reactionIntelligenceJobState.artifactSummary.reactionFeatureCount}</dd></div>
          </dl>
        ) : null}
        {reactionIntelligenceJobState.error ? (
          <p className={messageClassName} data-tone="danger">{reactionIntelligenceJobState.error}</p>
        ) : null}
        {reactionIntelligenceJobState.logTail.length > 0 ? (
          <div className={logClassName} aria-label="Reaction intelligence log tail">
            {reactionIntelligenceJobState.logTail.slice(-4).map((line, index) => (
              <code key={`${index}-${line}`} className="truncate">{line}</code>
            ))}
          </div>
        ) : null}
      </div>
      <div className={actionRowClassName}>
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
      {unavailableMessage ? <p className={messageClassName} data-tone="warning">{unavailableMessage}</p> : null}
      {disabledReason ? <p className={messageClassName} data-tone="warning">{disabledReason}</p> : null}
      {syncDisabledReason ? <p className={messageClassName} data-tone="warning">{syncDisabledReason}</p> : null}
      {errorMessage ? <p className={messageClassName} data-tone="danger" role="alert">{errorMessage}</p> : null}
      <div className={cardClassName} data-state={snapshotState.state} aria-live="polite">
        <div className={statusRowClassName}>
          <span className={statusPillClassName}>{snapshotState.state}</span>
          <p className={statusMessageClassName}>{snapshotState.message}</p>
        </div>
        {snapshotState.summary ? (
          <dl className={summaryGridClassName}>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Local id</dt><dd className={summaryValueClassName} title={snapshotState.summary.localId}>{summarizeLocalId(snapshotState.summary.localId)}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Pending</dt><dd className={summaryValueClassName}>{snapshotState.summary.pendingCount}</dd></div>
            <div className={summaryCellClassName}><dt className={summaryTermClassName}>Idempotency</dt><dd className={summaryValueClassName} title={snapshotState.summary.idempotencyKey}>{summarizeLocalId(snapshotState.summary.idempotencyKey)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className={cardClassName} data-state={syncState.state} aria-live="polite">
        <div className={statusRowClassName}>
          <span className={statusPillClassName}>{syncState.state}</span>
          <p className={statusMessageClassName}>{syncState.message}</p>
        </div>
        {syncState.summary ? (
          <>
            <dl className={summaryGridClassName}>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>Counts</dt><dd className={summaryValueClassName}>{formatLocalSyncCounts(syncState.summary)}</dd></div>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>Target</dt><dd className={summaryValueClassName}>{syncState.summary.target.kind}</dd></div>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>Source</dt><dd className={summaryValueClassName} title={redactSensitiveRuntimeText(syncState.summary.target.source)}>{redactSensitiveRuntimeText(syncState.summary.target.source)}</dd></div>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>Host</dt><dd className={summaryValueClassName}>{formatPostgresValue(syncState.summary.target.host)}</dd></div>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>Database</dt><dd className={summaryValueClassName}>{formatPostgresValue(syncState.summary.target.database)}</dd></div>
              <div className={summaryCellClassName}><dt className={summaryTermClassName}>User</dt><dd className={summaryValueClassName}>{formatPostgresValue(syncState.summary.target.user)}</dd></div>
            </dl>
            {syncRows.length > 0 ? (
              <ul className={listClassName} aria-label="Local outbox sync results">
                {syncRows.slice(0, 6).map((row) => (
                  <li key={row.rowId} className={listItemClassName} data-category={row.category}>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{row.conflict ? "conflict" : row.status}</span>
                    <code className="text-muted-foreground" title={row.localId}>{summarizeLocalId(row.localId)}</code>
                    <strong className="truncate" title={row.message}>{row.message}</strong>
                    <small className="min-w-0 truncate text-muted-foreground" title={row.graphSnapshotId ?? row.idempotencyKey}>
                      {row.graphSnapshotId ? summarizeLocalId(row.graphSnapshotId) : summarizeLocalId(row.idempotencyKey)}
                    </small>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <dl className={fieldsClassName}>
        {getLocalStoreFields(status).map(([label, value]) => (
          <div key={label} className={`${summaryCellClassName} ${label === "Storage path" ? fieldWideClassName : ""}`}>
            <dt className={summaryTermClassName}>{label}</dt>
            <dd className={summaryValueClassName} title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
