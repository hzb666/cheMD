import { FlaskConical, PlayCircle, RefreshCw, ScrollText, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import type { SidecarStatus } from "../desktop-contracts";
import type { SidecarOperation } from "../desktop-types";
import { formatSidecarStartedAt } from "../desktop-utils";

// ---------------------------------------------------------------------------
// SidecarButton
// ---------------------------------------------------------------------------

export const SidecarButton = ({
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
  operation: SidecarOperation;
  activeOperation: SidecarOperation | null;
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
// SidecarControlPanel
// ---------------------------------------------------------------------------

export const SidecarControlPanel = ({
  status,
  logTail,
  operation,
  message,
  errorMessage,
  onStart,
  onStop,
  onRefresh,
  onLoadLogs
}: {
  status: SidecarStatus;
  logTail: string[];
  operation: SidecarOperation | null;
  message: string | null;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onLoadLogs: () => void;
}) => {
  const busy = operation !== null;
  const canStart = !busy && status.state !== "ready" && status.pid === null;
  const canStop = !busy && (status.state === "ready" || status.pid !== null);
  const visibleLogTail = logTail.length > 0 ? logTail : status.logTail;

  return (
    <section className="desktop-sidecar-panel" aria-label="chem-service sidecar controls">
      <div className="desktop-sidecar-heading">
        <div className="desktop-agent-subhead"><FlaskConical size={14} /><span>chem-service sidecar</span></div>
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <div className="desktop-sidecar-actions">
        <SidecarButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!canStart} onClick={onStart} />
        <SidecarButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!canStop} onClick={onStop} />
        <SidecarButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={busy} onClick={onRefresh} />
        <SidecarButton label="Load logs" loadingLabel="Loading" icon={ScrollText} operation="logs" activeOperation={operation} disabled={busy} onClick={onLoadLogs} />
      </div>
      <dl className="desktop-sidecar-fields">
        <div><dt>State</dt><dd>{status.state}</dd></div>
        <div><dt>PID</dt><dd>{status.pid ?? "none"}</dd></div>
        <div><dt>Started</dt><dd>{formatSidecarStartedAt(status.startedAt)}</dd></div>
        <div><dt>Detail</dt><dd>{status.detail}</dd></div>
      </dl>
      {errorMessage ? <p className="desktop-sidecar-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="desktop-sidecar-message" data-tone="info">{message}</p> : null}
      <div className="desktop-sidecar-log" aria-label="chem-service log tail">
        {visibleLogTail.length > 0
          ? visibleLogTail.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)
          : <span>No log tail loaded.</span>}
      </div>
    </section>
  );
};
