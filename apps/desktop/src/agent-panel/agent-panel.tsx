import { Activity, AlertTriangle, Bot, CheckCircle2, PlayCircle, ShieldCheck, Wrench, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import type {
  AgentPatchGateStatus,
  AgentPatchRow,
  AgentTimelinePanel,
  AgentTimelinePanelState,
  AgentTimelineRow,
  AgentToolCallRow,
  AgentWarning
} from "./timeline-panel";
import { Button } from "../components/ui/button";

export type AgentPatchAction = (patch: AgentPatchRow) => void;

const panelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/15 p-3 text-sm shadow-none";
const headingClassName = "flex items-center gap-2";
const statusClassName = "rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary";
const messageClassName = "rounded-xl border border-white/35 bg-white/18 p-3 text-sm data-[tone=danger]:text-destructive data-[tone=info]:text-primary";
const sectionClassName = "rounded-xl border border-white/35 bg-white/18 p-3";
const subheadClassName = "flex items-center gap-2 text-xs font-medium text-muted-foreground";
const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";
const listClassName = "m-0 flex list-none flex-col gap-2 p-0";
const listItemClassName = "min-w-0 rounded-xl border border-white/35 bg-white/18 p-2 text-xs";
const timelineRowClassName = "flex items-center gap-2 rounded-xl border border-white/35 bg-white/18 p-2 text-xs";
const actionRowClassName = "flex flex-wrap items-center gap-2";
const ledgerClassName = "flex items-center gap-2";

export interface AgentPanelProps {
  panel: AgentTimelinePanel;
  quickFixControls?: ReactNode;
  onApprovePatch?: AgentPatchAction;
  onApplyPatch?: AgentPatchAction;
  onRejectPatch?: AgentPatchAction;
}

export const AgentPanel = ({
  panel,
  quickFixControls,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: AgentPanelProps) => (
  <div className={panelClassName}>
    <AgentPanelHeader panel={panel} />
    <AgentSummary panel={panel} />
    {quickFixControls}
    <AgentToolCalls rows={panel.toolCallRows} />
    <AgentPatchGate panel={panel} />
    <AgentPatchRows
      rows={panel.patchRows}
      onApprovePatch={onApprovePatch}
      onApplyPatch={onApplyPatch}
      onRejectPatch={onRejectPatch}
    />
    <AgentWarnings warnings={panel.warnings} />
    <AgentTimelineRows rows={panel.timelineRows} />
    <AgentLedger panel={panel} />
  </div>
);

const AgentPanelHeader = ({ panel }: { panel: AgentTimelinePanel }) => (
  <>
    <div className={headingClassName}>
      <Bot size={15} />
      <span>Agent run</span>
      <span className={statusClassName} data-status={toStatusToken(panel.state)}>
        {panel.summary.statusLabel}
      </span>
    </div>
    <p className={messageClassName} data-tone={toMessageTone(panel)}>
      {panel.message}
    </p>
  </>
);

const AgentSummary = ({ panel }: { panel: AgentTimelinePanel }) => (
  <section className={sectionClassName} aria-label="Agent summary">
    <div className={subheadClassName}>
      <CheckCircle2 size={14} />
      <span>{panel.summary.goal}</span>
    </div>
    {panel.summary.finalSummary ? <p>{panel.summary.finalSummary}</p> : null}
    <KeyValueList
      rows={[
        ["Status", panel.summary.statusLabel],
        ["Workspace", panel.summary.workspaceId ?? "none"],
        ["Run", panel.summary.runId ?? "none"],
        ["Targets", formatTargets(panel.summary.targetFiles)]
      ]}
    />
  </section>
);

const AgentToolCalls = ({ rows }: { rows: readonly AgentToolCallRow[] }) => (
  <section className={sectionClassName} aria-label="Tool calls">
    <div className={subheadClassName}>
      <Activity size={14} />
      <span>Tool calls</span>
    </div>
    {rows.length > 0
      ? rows.map((row) => <AgentToolCallRow key={row.toolCallId} row={row} />)
      : <p className={emptyCopyClassName}>No tool calls recorded.</p>}
  </section>
);

const AgentToolCallRow = ({ row }: { row: AgentToolCallRow }) => (
  <div className={timelineRowClassName} data-type="tool_call">
    <span>{row.toolName}</span>
    <p>
      {row.inputSummary}
      <br />
      {row.outputSummary}
    </p>
    <time dateTime={row.finishedAt ?? row.startedAt}>{formatDuration(row)}</time>
  </div>
);

const AgentPatchGate = ({ panel }: { panel: AgentTimelinePanel }) => (
  <section className={sectionClassName} aria-label="Patch gate">
    <div className={subheadClassName}>
      <ShieldCheck size={14} />
      <span>Patch gate</span>
    </div>
    <p data-status={panel.safety.patchGate.status}>{panel.safety.patchGate.message}</p>
    <p>{panel.safety.citationGate.message}</p>
  </section>
);

const AgentPatchRows = ({
  rows,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  rows: readonly AgentPatchRow[];
  onApprovePatch?: AgentPatchAction;
  onApplyPatch?: AgentPatchAction;
  onRejectPatch?: AgentPatchAction;
}) => (
  <section className={sectionClassName} aria-label="Patch proposals">
    <div className={subheadClassName}>
      <Wrench size={14} />
      <span>Patch proposals</span>
    </div>
    {rows.length > 0
      ? rows.map((row) => (
          <AgentPatchRow
            key={row.patchProposalId}
            row={row}
            onApprovePatch={onApprovePatch}
            onApplyPatch={onApplyPatch}
            onRejectPatch={onRejectPatch}
          />
        ))
      : <p className={emptyCopyClassName}>No patch proposal is waiting for review.</p>}
  </section>
);

const AgentPatchRow = ({
  row,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  row: AgentPatchRow;
  onApprovePatch?: AgentPatchAction;
  onApplyPatch?: AgentPatchAction;
  onRejectPatch?: AgentPatchAction;
}) => (
  <div>
    <div className={subheadClassName}>
      <span>{row.title}</span>
    </div>
    <p>{row.rationale}</p>
    <KeyValueList
      rows={[
        ["Document", row.documentId],
        ["Edits", String(row.editCount)],
        ["Evidence", `${row.evidenceCount} items, ${row.citationCount} cited`],
        ["Gate", row.gate.status]
      ]}
    />
    <div className={actionRowClassName}>
      <PatchActionButton disabled={!canApprove(row)} onClick={() => onApprovePatch?.(row)}>
        <ShieldCheck size={14} />Approve
      </PatchActionButton>
      <PatchActionButton primary disabled={!canApply(row)} onClick={() => onApplyPatch?.(row)}>
        <PlayCircle size={14} />Apply
      </PatchActionButton>
      <PatchActionButton disabled={!canReject(row)} onClick={() => onRejectPatch?.(row)}>
        <XCircle size={14} />Reject
      </PatchActionButton>
    </div>
  </div>
);

const AgentWarnings = ({ warnings }: { warnings: readonly AgentWarning[] }) => (
  warnings.length > 0 ? (
    <section className={sectionClassName} aria-label="Warnings">
      <div className={subheadClassName}>
        <AlertTriangle size={14} />
        <span>Warnings</span>
      </div>
      <ul className={listClassName}>
        {warnings.map((warning) => (
          <li key={warning.id} className={listItemClassName} data-severity={warning.severity}>
            <span className="text-muted-foreground">{warning.source}</span>
            <code className="text-muted-foreground">{warning.code}</code>
          </li>
        ))}
      </ul>
    </section>
  ) : null
);

const AgentTimelineRows = ({ rows }: { rows: readonly AgentTimelineRow[] }) => (
  <section className={sectionClassName} aria-label="Timeline">
    <div className={subheadClassName}>
      <Activity size={14} />
      <span>Timeline</span>
    </div>
    {rows.length > 0
      ? rows.map((row) => (
          <div key={row.rowId} className={timelineRowClassName} data-type={row.type}>
            <span>{row.label}</span>
            <p>{row.message}</p>
            <time dateTime={row.at}>{formatTime(row.at)}</time>
          </div>
        ))
      : <p className={emptyCopyClassName}>No agent run has started.</p>}
  </section>
);

const AgentLedger = ({ panel }: { panel: AgentTimelinePanel }) => (
  <div className={ledgerClassName}>
    <span>{panel.summary.counts.toolCalls} tools</span>
    <span>{panel.summary.counts.evidence} evidence</span>
    <span>{panel.summary.counts.patchProposals} patches</span>
    <span>{panel.summary.counts.warnings} warnings</span>
  </div>
);

const KeyValueList = ({ rows }: { rows: readonly [string, string][] }) => (
  <ul className={listClassName}>
    {rows.map(([label, value]) => (
      <li key={label} className={listItemClassName}>
        <span className="text-muted-foreground">{label}</span>
        <code className="text-muted-foreground">{value}</code>
      </li>
    ))}
  </ul>
);

const PatchActionButton = ({
  children,
  disabled,
  primary,
  onClick
}: {
  children: ReactNode;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) => (
  <Button
    type="button"
    variant={primary ? "default" : "surface"}
    size="control"
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
  >
    {children}
  </Button>
);

export const canApprove = (row: AgentPatchRow): boolean =>
  row.gate.status === "requires_approval";

export const canApply = (row: AgentPatchRow): boolean =>
  row.gate.status === "ready_to_apply";

export const canReject = (row: AgentPatchRow): boolean =>
  row.gate.status === "requires_approval" || row.gate.status === "ready_to_apply";

const toMessageTone = (
  panel: AgentTimelinePanel
): "info" | "success" | "warning" | "danger" => {
  if (panel.state === "completed") return "success";
  if (panel.state === "failed" || panel.state === "blocked") return "danger";
  if (panel.warnings.length > 0 || panel.safety.patchGate.status === "blocked") return "warning";
  return "info";
};

const toStatusToken = (state: AgentTimelinePanelState): AgentPatchGateStatus | string =>
  state === "empty" ? "created" : state;

const formatTargets = (targets: readonly string[]): string =>
  targets.length === 0 ? "none" : targets.join(", ");

const formatDuration = (row: AgentToolCallRow): string => {
  if (row.durationMs !== undefined) return `${row.durationMs}ms`;
  return formatTime(row.finishedAt ?? row.startedAt);
};

const formatTime = (value?: string): string =>
  value === undefined ? "now" : new Date(value).toLocaleTimeString();
