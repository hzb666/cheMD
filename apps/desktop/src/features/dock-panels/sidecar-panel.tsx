import { FlaskConical, PlayCircle, RefreshCw, ScrollText, Square } from "lucide-react";
import { StatusBadge } from "@/components/common/status-badge";
import type { SidecarStatus } from "../../contracts";
import type { SidecarOperation } from "../../types";
import { formatSidecarStartedAt } from "../../utils";
import {
  DockPanelButton,
  dockPanelActionRowClassName,
  dockPanelHeadingClassName,
  dockPanelLogClassName,
  dockPanelMessageClassName,
  dockPanelMetricCellClassName,
  dockPanelMetricGridClassName,
  dockPanelMetricTermClassName,
  dockPanelMetricValueClassName,
  dockPanelClassName,
  dockPanelSubheadClassName,
} from "./panel-primitives";

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
  return (
    <DockPanelButton
      label={label}
      loadingLabel={loadingLabel}
      icon={Icon}
      operation={operation}
      activeOperation={activeOperation}
      disabled={disabled}
      onClick={onClick}
    />
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
    <section className={dockPanelClassName} aria-label="chem-service sidecar controls">
      <div className={dockPanelHeadingClassName}>
        <div className={dockPanelSubheadClassName}><FlaskConical size={14} /><span>chem-service sidecar</span></div>
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <div className={dockPanelActionRowClassName}>
        <SidecarButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!canStart} onClick={onStart} />
        <SidecarButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!canStop} onClick={onStop} />
        <SidecarButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={busy} onClick={onRefresh} />
        <SidecarButton label="Load logs" loadingLabel="Loading" icon={ScrollText} operation="logs" activeOperation={operation} disabled={busy} onClick={onLoadLogs} />
      </div>
      <dl className={dockPanelMetricGridClassName}>
        <div className={dockPanelMetricCellClassName}><dt className={dockPanelMetricTermClassName}>State</dt><dd className={dockPanelMetricValueClassName}>{status.state}</dd></div>
        <div className={dockPanelMetricCellClassName}><dt className={dockPanelMetricTermClassName}>PID</dt><dd className={dockPanelMetricValueClassName}>{status.pid ?? "none"}</dd></div>
        <div className={dockPanelMetricCellClassName}><dt className={dockPanelMetricTermClassName}>Started</dt><dd className={dockPanelMetricValueClassName}>{formatSidecarStartedAt(status.startedAt)}</dd></div>
        <div className={dockPanelMetricCellClassName}><dt className={dockPanelMetricTermClassName}>Detail</dt><dd className={dockPanelMetricValueClassName}>{status.detail}</dd></div>
      </dl>
      {errorMessage ? <p className={dockPanelMessageClassName} data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className={dockPanelMessageClassName} data-tone="info">{message}</p> : null}
      <div className={dockPanelLogClassName} aria-label="chem-service log tail">
        {visibleLogTail.length > 0
          ? visibleLogTail.map((line, index) => <code key={`${index}-${line}`} className="truncate">{line}</code>)
          : <span className="truncate">No log tail loaded.</span>}
      </div>
    </section>
  );
};
