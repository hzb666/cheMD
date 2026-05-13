import { Activity, AlertTriangle, Bot, CheckCircle2, PlayCircle, ShieldCheck, Wrench, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import type {
  DesktopAgentPatchGateStatus,
  DesktopAgentPatchRow,
  DesktopAgentTimelinePanel,
  DesktopAgentTimelinePanelState,
  DesktopAgentTimelineRow,
  DesktopAgentToolCallRow,
  DesktopAgentWarning
} from "../desktop-agent-timeline-panel";

export type DesktopAgentPatchAction = (patch: DesktopAgentPatchRow) => void;

export interface DesktopAgentPanelProps {
  panel: DesktopAgentTimelinePanel;
  onApprovePatch?: DesktopAgentPatchAction;
  onApplyPatch?: DesktopAgentPatchAction;
  onRejectPatch?: DesktopAgentPatchAction;
}

export const DesktopAgentPanel = ({
  panel,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: DesktopAgentPanelProps) => (
  <div className="desktop-agent-panel">
    <AgentPanelHeader panel={panel} />
    <AgentSummary panel={panel} />
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

const AgentPanelHeader = ({ panel }: { panel: DesktopAgentTimelinePanel }) => (
  <>
    <div className="desktop-agent-heading">
      <Bot size={15} />
      <span>Agent run</span>
      <span className="desktop-agent-status" data-status={toStatusToken(panel.state)}>
        {panel.summary.statusLabel}
      </span>
    </div>
    <p className="desktop-agent-message" data-tone={toMessageTone(panel)}>
      {panel.message}
    </p>
  </>
);

const AgentSummary = ({ panel }: { panel: DesktopAgentTimelinePanel }) => (
  <section className="desktop-agent-proposal" aria-label="Agent summary">
    <div className="desktop-agent-subhead">
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

const AgentToolCalls = ({ rows }: { rows: readonly DesktopAgentToolCallRow[] }) => (
  <section className="desktop-agent-timeline" aria-label="Tool calls">
    <div className="desktop-agent-subhead">
      <Activity size={14} />
      <span>Tool calls</span>
    </div>
    {rows.length > 0
      ? rows.map((row) => <AgentToolCallRow key={row.toolCallId} row={row} />)
      : <p className="desktop-empty-copy">No tool calls recorded.</p>}
  </section>
);

const AgentToolCallRow = ({ row }: { row: DesktopAgentToolCallRow }) => (
  <div className="desktop-agent-timeline-row" data-type="tool_call">
    <span>{row.toolName}</span>
    <p>
      {row.inputSummary}
      <br />
      {row.outputSummary}
    </p>
    <time dateTime={row.finishedAt ?? row.startedAt}>{formatDuration(row)}</time>
  </div>
);

const AgentPatchGate = ({ panel }: { panel: DesktopAgentTimelinePanel }) => (
  <section className="desktop-agent-proposal" aria-label="Patch gate">
    <div className="desktop-agent-subhead">
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
  rows: readonly DesktopAgentPatchRow[];
  onApprovePatch?: DesktopAgentPatchAction;
  onApplyPatch?: DesktopAgentPatchAction;
  onRejectPatch?: DesktopAgentPatchAction;
}) => (
  <section className="desktop-agent-proposal" aria-label="Patch proposals">
    <div className="desktop-agent-subhead">
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
      : <p className="desktop-empty-copy">No patch proposal is waiting for review.</p>}
  </section>
);

const AgentPatchRow = ({
  row,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  row: DesktopAgentPatchRow;
  onApprovePatch?: DesktopAgentPatchAction;
  onApplyPatch?: DesktopAgentPatchAction;
  onRejectPatch?: DesktopAgentPatchAction;
}) => (
  <div>
    <div className="desktop-agent-subhead">
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
    <div className="desktop-agent-action-row">
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

const AgentWarnings = ({ warnings }: { warnings: readonly DesktopAgentWarning[] }) => (
  warnings.length > 0 ? (
    <section className="desktop-agent-proposal" aria-label="Warnings">
      <div className="desktop-agent-subhead">
        <AlertTriangle size={14} />
        <span>Warnings</span>
      </div>
      <ul className="desktop-agent-edit-list">
        {warnings.map((warning) => (
          <li key={warning.id} data-severity={warning.severity}>
            <span>{warning.source}</span>
            <code>{warning.code}</code>
          </li>
        ))}
      </ul>
    </section>
  ) : null
);

const AgentTimelineRows = ({ rows }: { rows: readonly DesktopAgentTimelineRow[] }) => (
  <section className="desktop-agent-timeline" aria-label="Timeline">
    <div className="desktop-agent-subhead">
      <Activity size={14} />
      <span>Timeline</span>
    </div>
    {rows.length > 0
      ? rows.map((row) => (
          <div key={row.rowId} className="desktop-agent-timeline-row" data-type={row.type}>
            <span>{row.label}</span>
            <p>{row.message}</p>
            <time dateTime={row.at}>{formatTime(row.at)}</time>
          </div>
        ))
      : <p className="desktop-empty-copy">No agent run has started.</p>}
  </section>
);

const AgentLedger = ({ panel }: { panel: DesktopAgentTimelinePanel }) => (
  <div className="desktop-agent-ledger">
    <span>{panel.summary.counts.toolCalls} tools</span>
    <span>{panel.summary.counts.evidence} evidence</span>
    <span>{panel.summary.counts.patchProposals} patches</span>
    <span>{panel.summary.counts.warnings} warnings</span>
  </div>
);

const KeyValueList = ({ rows }: { rows: readonly [string, string][] }) => (
  <ul className="desktop-agent-edit-list">
    {rows.map(([label, value]) => (
      <li key={label}>
        <span>{label}</span>
        <code>{value}</code>
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
  <button
    type="button"
    className={primary ? "desktop-button-primary" : "desktop-button"}
    disabled={disabled}
    onClick={disabled ? undefined : onClick}
  >
    {children}
  </button>
);

export const canApprove = (row: DesktopAgentPatchRow): boolean =>
  row.gate.status === "requires_approval";

export const canApply = (row: DesktopAgentPatchRow): boolean =>
  row.gate.status === "ready_to_apply";

export const canReject = (row: DesktopAgentPatchRow): boolean =>
  row.gate.status === "requires_approval" || row.gate.status === "ready_to_apply";

const toMessageTone = (
  panel: DesktopAgentTimelinePanel
): "info" | "success" | "warning" | "danger" => {
  if (panel.state === "completed") return "success";
  if (panel.state === "failed" || panel.state === "blocked") return "danger";
  if (panel.warnings.length > 0 || panel.safety.patchGate.status === "blocked") return "warning";
  return "info";
};

const toStatusToken = (state: DesktopAgentTimelinePanelState): DesktopAgentPatchGateStatus | string =>
  state === "empty" ? "created" : state;

const formatTargets = (targets: readonly string[]): string =>
  targets.length === 0 ? "none" : targets.join(", ");

const formatDuration = (row: DesktopAgentToolCallRow): string => {
  if (row.durationMs !== undefined) return `${row.durationMs}ms`;
  return formatTime(row.finishedAt ?? row.startedAt);
};

const formatTime = (value?: string): string =>
  value === undefined ? "now" : new Date(value).toLocaleTimeString();
