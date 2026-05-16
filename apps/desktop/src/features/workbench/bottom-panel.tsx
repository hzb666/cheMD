import { X } from "lucide-react";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
} from "@chemd/language-service";
import { Button } from "@/components/ui/button";
import type { WorkbenchProps, InsightPaneProps } from "../../types";
import { getDiagnosticStats } from "../../utils";
import { InsightDockContent } from "../dock-panels/insight-content";
export type ReferenceBottomPanelId = "diagnostics" | "terminal" | "runtime" | "storage";

const diagnosticsRowClassName = "grid min-h-7 grid-cols-[4.5rem_6rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-[var(--shell-diagnostics-row-bg)] px-2 text-xs";

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
    <section className="flex h-[min(280px,36vh)] min-h-0 shrink-0 flex-col overflow-hidden border-t border-[var(--shell-border-strong)] bg-transparent" aria-label="Terminal and diagnostics">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--shell-border-muted)] bg-[var(--shell-bottom-tabs)] px-2">
        {bottomPanelTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="h-7 cursor-pointer rounded-lg border-0 bg-transparent px-2.5 text-xs font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-in-out hover:bg-[var(--shell-tab-active)] hover:text-foreground data-[active=true]:bg-[var(--shell-tab-active)] data-[active=true]:text-foreground"
            data-active={panel === tab.id ? "true" : undefined}
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
        <span className="rounded-md bg-[var(--shell-diagnostics-ok-bg)] px-1.5 py-0.5 font-bold text-success data-[status=failed]:bg-[var(--shell-diagnostics-error-bg)] data-[status=failed]:text-destructive" data-status={compileStatus}>
          {compileStatus === "ok" ? "Compiled" : "Compile failed"}
        </span>
        <strong>{stats.errors} errors / {stats.warnings} warnings / {stats.infos} info</strong>
      </div>
      {errorMessage ? (
        <p className="rounded-md bg-[var(--shell-diagnostics-message-bg)] px-2.5 py-2 text-xs text-destructive" role="alert">{errorMessage}</p>
      ) : null}
      <div className="grid gap-1" role={compileStatus === "failed" ? "alert" : "list"}>
        {diagnostics.length > 0 ? diagnostics.map((diagnostic) => (
          <div
            key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.range.startColumn}-${diagnostic.message}`}
            className={diagnosticsRowClassName}
            data-severity={diagnostic.severity}
            role="listitem"
          >
            <span className="font-bold capitalize data-[severity=error]:text-destructive" data-severity={diagnostic.severity}>{diagnostic.severity}</span>
            <strong>{diagnostic.code}</strong>
            <p className="min-w-0 truncate" title={diagnostic.message}>{diagnostic.message}</p>
            <code className="text-xs text-muted-foreground">L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}</code>
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
    <div className="grid gap-1.5 rounded-md bg-[var(--shell-terminal-bg)] p-3 text-xs text-[var(--shell-terminal-fg)]" role="log" aria-label="Terminal output">
      <code className="text-xs text-[var(--shell-terminal-code)]">Terminal output is not attached yet.</code>
      <span>Runtime logs are available from the Runtime tab.</span>
    </div>
  );
}
