import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Eye,
  FileCode2,
  PanelBottom,
} from "lucide-react";
import type { ChemdLanguageCompileOutput } from "@chemd/language-service";
import { Button } from "@/components/ui/button";
import type { WorkbenchProps } from "../../types";
import { getDiagnosticStats } from "../../utils";
import type { MonacoCursorPosition } from "../editor/source-path";
import type { ReferenceBottomPanelId } from "./bottom-panel";

const MonacoChemdEditor = lazy(() =>
  import("../editor/monaco-chemd-editor").then((module) => ({
    default: module.MonacoChemdEditor
  }))
);

const tabActionClassName = "reference-tab-action rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-white/35 data-[active=true]:bg-[var(--shell-tab-action-active)] data-[active=true]:text-foreground";
const statusItemClassName = "inline-flex min-w-0 shrink-0 items-center gap-1 border-l border-[var(--shell-border-strong)] pl-1.5 whitespace-nowrap";

export function ReferenceSidebarResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="reference-sidebar-resize-handle absolute bottom-2 left-0.5 top-0 z-20 w-3 cursor-col-resize bg-transparent"
      role="separator"
      aria-label="Resize left sidebar"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
    />
  );
}

export function ReferenceDocumentSurface({
  file,
  source,
  compileOutput,
  workspaceSymbolIndex,
  workspaceConflict,
  canSave,
  dirty,
  editorRef,
  settings,
  sidebarVisible,
  previewVisible,
  bottomPanel,
  onChange,
  onSave,
  onTogglePreview,
  onToggleDiagnostics,
  onReloadWorkspaceConflict,
  onKeepLocalWorkspaceConflict,
  onSidebarResize,
}: {
  file: WorkbenchProps["selectedFile"];
  source: WorkbenchProps["source"];
  compileOutput: WorkbenchProps["output"];
  workspaceSymbolIndex: WorkbenchProps["workspaceSymbolIndexController"]["index"];
  workspaceConflict: WorkbenchProps["workspaceConflict"];
  canSave: WorkbenchProps["canSave"];
  dirty: boolean;
  editorRef: WorkbenchProps["editorRef"];
  settings: WorkbenchProps["settings"];
  sidebarVisible: boolean;
  previewVisible: boolean;
  bottomPanel: ReferenceBottomPanelId | null;
  onChange: WorkbenchProps["onSourceChange"];
  onSave: WorkbenchProps["onSave"];
  onTogglePreview: () => void;
  onToggleDiagnostics: () => void;
  onReloadWorkspaceConflict: WorkbenchProps["onReloadWorkspaceConflict"];
  onKeepLocalWorkspaceConflict: WorkbenchProps["onKeepLocalWorkspaceConflict"];
  onSidebarResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const [cursorPosition, setCursorPosition] = useState<MonacoCursorPosition>({
    lineNumber: 1,
    column: 1
  });
  const diagnostics = compileOutput.diagnostics;
  const diagnosticStats = getDiagnosticStats(diagnostics);
  const lineCount = useMemo(() => source.split(/\r?\n/).length, [source]);

  return (
    <section className="relative z-10 min-w-0 flex-1 overflow-visible bg-transparent pb-2 pl-2 pr-2">
      {sidebarVisible ? <ReferenceSidebarResizeHandle onPointerDown={onSidebarResize} /> : null}
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--shell-card-border)] bg-[var(--reference-surface-bg)] shadow-[var(--shell-card-shadow)]">
        <div className="flex h-[50px] shrink-0 items-center bg-[var(--reference-surface-bg)] px-6">
          <div className="flex w-32 items-center gap-4 text-muted-foreground">
            <ChevronLeft size={19} />
            <ChevronRight size={19} />
          </div>
          <div className="min-w-0 flex-1 text-center text-xl font-semibold text-foreground">{file.name}</div>
          <div className="flex w-72 items-center justify-end gap-2 text-muted-foreground" aria-label="Editor view controls">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={tabActionClassName}
              disabled={!canSave}
              onClick={onSave}
            >
              {dirty ? "Save" : "Saved"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={tabActionClassName}
              data-active={previewVisible ? "true" : undefined}
              aria-pressed={previewVisible}
              title={previewVisible ? "Hide Chemd preview" : "Show Chemd preview"}
              onClick={onTogglePreview}
            >
              <Eye size={14} />
              <span>Preview</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={tabActionClassName}
              data-active={bottomPanel === "diagnostics" ? "true" : undefined}
              aria-pressed={bottomPanel === "diagnostics"}
              title="Toggle diagnostics panel"
              onClick={onToggleDiagnostics}
            >
              <PanelBottom size={14} />
              <span>Diagnose</span>
            </Button>
            <span className="rounded-md bg-[#eeeaff] p-1 text-violet-600" title="Chemd editor active">
              <FileCode2 size={18} />
            </span>
            <span className="text-xs font-semibold text-muted-foreground">Source</span>
          </div>
        </div>
        {workspaceConflict ? (
          <div className="flex shrink-0 items-center gap-2 border-y border-[var(--shell-conflict-border)] bg-[var(--shell-conflict-bg)] px-3 py-2 text-xs text-[var(--shell-conflict-fg)]" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <strong>Workspace file changed on disk</strong>
              <p className="truncate">{workspaceConflict.message}</p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={workspaceConflict.reloading}
              aria-busy={workspaceConflict.reloading}
              onClick={onReloadWorkspaceConflict}
            >
              {workspaceConflict.reloading ? "Reloading" : "Reload"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={workspaceConflict.reloading}
              onClick={onKeepLocalWorkspaceConflict}
            >
              Keep local
            </Button>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden bg-editor-surface">
          <Suspense fallback={<div className="monaco-loading flex h-full items-center justify-center text-sm text-muted-foreground">Loading Monaco editor...</div>}>
            <MonacoChemdEditor
              ref={editorRef}
              value={source}
              documentPath={file.path}
              compileOutput={compileOutput}
              workspaceSymbolIndex={workspaceSymbolIndex}
              editorSettings={settings}
              onChange={onChange}
              onSave={onSave}
              onBlurSave={settings.autoSaveMode === "onFocusLost" ? onSave : undefined}
              onCursorPositionChange={setCursorPosition}
            />
          </Suspense>
        </div>
        <ReferenceEditorStatusBar
          status={compileOutput.status}
          diagnostics={diagnosticStats}
          diagnosticCount={diagnostics.length}
          cursorPosition={cursorPosition}
          lineCount={lineCount}
          compiledAt={compileOutput.compiledAt}
        />
      </div>
    </section>
  );
}

function ReferenceEditorStatusBar({
  status,
  diagnostics,
  diagnosticCount,
  cursorPosition,
  lineCount,
  compiledAt,
}: {
  status: ChemdLanguageCompileOutput["status"];
  diagnostics: ReturnType<typeof getDiagnosticStats>;
  diagnosticCount: number;
  cursorPosition: MonacoCursorPosition;
  lineCount: number;
  compiledAt: string;
}) {
  const StatusIcon = status === "ok" ? CheckCircle2 : CircleDot;
  const statusLabel = status === "ok" ? "Compiled" : "Compile failed";

  return (
    <footer className="flex min-h-7 shrink-0 items-center justify-between gap-3 overflow-hidden border-t border-[var(--shell-border-strong)] bg-[var(--reference-surface-bg)] px-3.5 text-xs font-semibold text-muted-foreground" aria-label="Editor status">
      <div className="reference-status-group reference-status-group-left flex min-w-0 flex-[1_1_auto] items-center gap-2 overflow-hidden">
        <span className={`${statusItemClassName} border-l-0 pl-0 ${status === "ok" ? "text-success" : "text-destructive"}`}>
          <StatusIcon size={13} />
          {statusLabel}
        </span>
        <span className={statusItemClassName}>
          <AlertTriangle size={13} />
          {diagnosticCount} diagnostics
        </span>
        <span className={`${statusItemClassName} shrink truncate`}>
          {diagnostics.errors} errors / {diagnostics.warnings} warnings / {diagnostics.infos} info
        </span>
      </div>
      <div className="reference-status-group reference-status-group-right flex min-w-0 flex-[0_1_auto] items-center justify-end gap-2 overflow-hidden">
        <span className={`${statusItemClassName} border-l-0 pl-0`}>
          Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
        </span>
        <span className={statusItemClassName}>{lineCount} lines</span>
        <span className={`${statusItemClassName} max-[900px]:hidden`}>UTF-8</span>
        <span className={`${statusItemClassName} max-[900px]:hidden`}>LF</span>
        <span className={statusItemClassName}>Chemd</span>
        <span className={`${statusItemClassName} max-[1040px]:hidden`}>
          {new Date(compiledAt).toLocaleTimeString()}
        </span>
      </div>
    </footer>
  );
}
