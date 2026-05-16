import { FlaskConical, PlayCircle, RefreshCw, ScrollText, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import type { SidecarStatus } from "../../contracts";
import type { SidecarOperation } from "../../types";
import { formatSidecarStartedAt } from "../../utils";

const panelClassName = "flex min-h-0 flex-col gap-3 rounded-xl border border-white/35 bg-white/15 p-3 text-sm shadow-none";
const headingClassName = "flex items-center justify-between gap-2";
const subheadClassName = "flex items-center gap-2 text-xs font-medium text-muted-foreground";
const actionRowClassName = "flex flex-wrap items-center gap-2";
const fieldsClassName = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 text-xs";
const fieldCellClassName = "min-w-0 rounded-lg border border-white/35 bg-white/18 px-2.5 py-2";
const fieldTermClassName = "m-0 truncate text-xs font-medium uppercase text-muted-foreground";
const fieldDescriptionClassName = "mt-0.5 truncate font-mono text-xs text-foreground";
const messageClassName = "m-0 text-xs leading-relaxed text-muted-foreground data-[tone=danger]:text-destructive data-[tone=info]:text-primary";
const logClassName = "flex max-h-40 min-h-20 flex-col gap-1 overflow-auto rounded-xl border bg-slate-950/90 p-3 font-mono text-xs text-slate-100";

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
    <section className={panelClassName} aria-label="chem-service sidecar controls">
      <div className={headingClassName}>
        <div className={subheadClassName}><FlaskConical size={14} /><span>chem-service sidecar</span></div>
        <StatusBadge label={status.label} tone={status.state} dot detail={status.detail} />
      </div>
      <div className={actionRowClassName}>
        <SidecarButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!canStart} onClick={onStart} />
        <SidecarButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!canStop} onClick={onStop} />
        <SidecarButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={busy} onClick={onRefresh} />
        <SidecarButton label="Load logs" loadingLabel="Loading" icon={ScrollText} operation="logs" activeOperation={operation} disabled={busy} onClick={onLoadLogs} />
      </div>
      <dl className={fieldsClassName}>
        <div className={fieldCellClassName}><dt className={fieldTermClassName}>State</dt><dd className={fieldDescriptionClassName}>{status.state}</dd></div>
        <div className={fieldCellClassName}><dt className={fieldTermClassName}>PID</dt><dd className={fieldDescriptionClassName}>{status.pid ?? "none"}</dd></div>
        <div className={fieldCellClassName}><dt className={fieldTermClassName}>Started</dt><dd className={fieldDescriptionClassName}>{formatSidecarStartedAt(status.startedAt)}</dd></div>
        <div className={fieldCellClassName}><dt className={fieldTermClassName}>Detail</dt><dd className={fieldDescriptionClassName}>{status.detail}</dd></div>
      </dl>
      {errorMessage ? <p className={messageClassName} data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className={messageClassName} data-tone="info">{message}</p> : null}
      <div className={logClassName} aria-label="chem-service log tail">
        {visibleLogTail.length > 0
          ? visibleLogTail.map((line, index) => <code key={`${index}-${line}`} className="truncate">{line}</code>)
          : <span className="truncate">No log tail loaded.</span>}
      </div>
    </section>
  );
};
