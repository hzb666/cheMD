import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
} from "@chemd/language-service";
import { Button } from "@/components/ui/button";
import type { WorkbenchProps, InsightPaneProps } from "../../types";
import { getDiagnosticStats } from "../../utils";
import { InsightDockContent } from "../dock-panels/insight-content";
export type ReferenceBottomPanelId = "diagnostics" | "terminal" | "runtime" | "storage";
export const referenceBottomPanelDomId = "reference-bottom-panel";

const diagnosticsRowClassName = "grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-md bg-card/40 px-2.5 py-2 text-[13px] leading-5";

const bottomPanelTabs: {
  id: ReferenceBottomPanelId;
  label: string;
}[] = [
  { id: "diagnostics", label: "Diagnostics" },
  { id: "terminal", label: "Terminal" },
  { id: "runtime", label: "Runtime" },
  { id: "storage", label: "Storage" },
];

export function ReferenceBottomPanel({
  panel,
  props,
  compileOutput,
  compileError,
  onSelectPanel,
  onClose,
}: {
  panel: ReferenceBottomPanelId;
  props: InsightPaneProps;
  compileOutput: WorkbenchProps["output"];
  compileError?: string;
  onSelectPanel: (panel: ReferenceBottomPanelId) => void;
  onClose: () => void;
}) {
  return (
    <section
      id={referenceBottomPanelDomId}
      className="flex h-[var(--reference-bottom-panel-height,280px)] min-h-[160px] shrink-0 flex-col overflow-hidden bg-transparent"
      aria-label="Terminal and diagnostics"
    >
      <div className="flex h-9 shrink-0 items-center gap-1 px-2">
        {bottomPanelTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="h-7 cursor-pointer rounded-lg border-0 bg-transparent px-2.5 text-xs font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-in-out hover:bg-card/45 hover:text-foreground data-[active=true]:bg-[var(--editor-workspace-surface)] data-[active=true]:text-foreground"
            data-active={panel === tab.id ? "true" : undefined}
            aria-pressed={panel === tab.id}
            onClick={() => onSelectPanel(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <Button
          type="button"
          variant="window"
          size="window-icon"
          className="size-7"
          data-control="close"
          aria-label="Close bottom panel"
          title="Close bottom panel"
          onClick={onClose}
        >
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {panel === "diagnostics" ? (
          <ReferenceDiagnosticsPanel
            diagnostics={compileOutput.diagnostics}
            compileStatus={compileOutput.status}
            errorMessage={compileError}
          />
        ) : null}
        {panel === "terminal" ? <ReferenceTerminalPanel /> : null}
        {panel === "runtime" ? <InsightDockContent panel="runtime" props={props} /> : null}
        {panel === "storage" ? (
          <div className="grid min-h-0 gap-2">
            <InsightDockContent panel="postgres" props={props} />
            <InsightDockContent panel="storage" props={props} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function ReferenceBottomPanelResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div className="relative h-0 shrink-0">
      <div
        className="absolute -top-2 left-2 right-2 z-30 h-4 cursor-row-resize bg-transparent after:absolute after:left-0 after:right-0 after:top-1/2 after:h-1 after:-translate-y-1/2 after:bg-primary/60 after:opacity-0 after:transition-opacity hover:after:opacity-100"
        role="separator"
        aria-controls={referenceBottomPanelDomId}
        aria-label="Resize bottom panel"
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
      />
    </div>
  );
}

function ReferenceDiagnosticsPanel({
  diagnostics,
  compileStatus,
  errorMessage,
}: {
  diagnostics: ChemdEditorDiagnostic[];
  compileStatus: ChemdLanguageCompileOutput["status"];
  errorMessage?: string;
}) {
  const stats = getDiagnosticStats(diagnostics);
  return (
    <div className="grid gap-2 text-foreground">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="rounded-md bg-success/15 px-1.5 py-0.5 font-bold text-success data-[status=failed]:bg-destructive/10 data-[status=failed]:text-destructive" data-status={compileStatus}>
          {compileStatus === "ok" ? "Compiled" : "Compile failed"}
        </span>
        <strong>{stats.errors} errors / {stats.warnings} warnings / {stats.infos} info</strong>
      </div>
      {errorMessage ? (
        <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive" role="alert">{errorMessage}</p>
      ) : null}
      <div className="grid gap-1.5" role={compileStatus === "failed" ? "alert" : "list"}>
        {diagnostics.length > 0 ? diagnostics.map((diagnostic) => (
          <div
            key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.range.startColumn}-${diagnostic.message}`}
            className={diagnosticsRowClassName}
            data-severity={diagnostic.severity}
            role="listitem"
          >
            <span className="inline-flex h-5 shrink-0 items-center rounded-sm bg-muted/70 px-1.5 text-xs font-bold capitalize text-muted-foreground data-[severity=error]:bg-destructive/10 data-[severity=error]:text-destructive" data-severity={diagnostic.severity}>{diagnostic.severity}</span>
            <strong className="min-w-0 truncate text-xs font-semibold text-foreground" title={diagnostic.code}>{diagnostic.code}</strong>
            <code className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}</code>
            <p className="col-span-3 m-0 min-w-0 break-words text-muted-foreground [overflow-wrap:anywhere]" title={diagnostic.message}>{diagnostic.message}</p>
          </div>
        )) : (
          <p className="m-0 text-xs leading-relaxed text-muted-foreground">Language service reports no diagnostics for this buffer.</p>
        )}
      </div>
    </div>
  );
}

function ReferenceTerminalPanel() {
  return (
    <div className="grid gap-1.5 rounded-md bg-foreground/90 p-3 text-xs text-background/90" role="log" aria-label="Terminal output">
      <code className="text-xs text-success">Terminal output is not attached yet.</code>
      <span>Runtime logs are available from the Runtime tab.</span>
    </div>
  );
}
