import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Eye,
  PanelBottom,
  Redo2,
  Save,
  Undo2,
} from "lucide-react";
import type { ChemdLanguageCompileOutput } from "@chemd/language-service";
import { Button } from "@/components/ui/button";
import type { WorkbenchProps } from "../../types";
import { getDiagnosticStats } from "../../utils";
import type { MonacoCursorPosition, MonacoUndoRedoState } from "../editor/source-path";
import { HtmlPreview } from "../preview/html-preview";
import type { ReferenceBottomPanelId } from "./bottom-panel";
import { useHorizontalResize } from "./use-horizontal-resize";

const MonacoChemdEditor = lazy(() =>
  import("../editor/monaco-chemd-editor").then((module) => ({
    default: module.MonacoChemdEditor
  }))
);

const tabActionClassName = "reference-tab-action text-muted-foreground hover:bg-muted-foreground/15 hover:text-foreground data-[active=true]:bg-chemd-background data-[active=true]:text-chemd-foreground data-[active=true]:ring-1 data-[active=true]:ring-inset data-[active=true]:ring-chemd-foreground/30";
const saveActionClassName = `${tabActionClassName} data-[autosaved=true]:bg-success/15 data-[autosaved=true]:text-success data-[autosaved=true]:ring-1 data-[autosaved=true]:ring-inset data-[autosaved=true]:ring-success/30 data-[autosaved=true]:hover:bg-success/30`;
const statusItemClassName = "inline-flex min-w-0 shrink-0 items-center gap-1 border-l border-border/65 pl-1.5 whitespace-nowrap";
const DEFAULT_PREVIEW_WIDTH_PERCENT = 40;
const MIN_PREVIEW_WIDTH_PERCENT = 28;
const MAX_PREVIEW_WIDTH_PERCENT = 62;

export const getDelayUntilNextMinute = (now = new Date()): number => {
  const elapsedInMinute = now.getSeconds() * 1000 + now.getMilliseconds();
  return elapsedInMinute === 0 ? 60_000 : 60_000 - elapsedInMinute;
};

export const formatStatusClockTime = (date: Date): string =>
  date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

export const clampPreviewWidthPercent = (value: number): number =>
  Math.min(MAX_PREVIEW_WIDTH_PERCENT, Math.max(MIN_PREVIEW_WIDTH_PERCENT, value));

const useCurrentMinute = (): Date => {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      setCurrentTime(new Date());
      intervalId = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    }, getDelayUntilNextMinute());

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

  return currentTime;
};

const formatSaveStatusLabel = (savedAt: string | null): string => {
  if (!savedAt) return "Save";
  const savedDate = new Date(savedAt);
  if (Number.isNaN(savedDate.getTime())) return "Last saved";

  const now = new Date();
  const savedDay = new Date(savedDate.getFullYear(), savedDate.getMonth(), savedDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayDelta = Math.max(0, Math.floor((today - savedDay) / 86_400_000));

  if (dayDelta > 0) return `${dayDelta} ${dayDelta === 1 ? "day" : "days"}`;

  return `Last saved: ${savedDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
};

export function ReferenceSidebarResizeHandle({
  onPointerDown,
}: {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      className="reference-sidebar-resize-handle absolute bottom-2 left-0.5 top-0 z-20 w-3 cursor-col-resize bg-transparent after:absolute after:bottom-0.5 after:left-1/2 after:top-0.5 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary/70 after:opacity-0 after:transition-opacity hover:after:opacity-100"
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
  savedAt,
  compileOutput,
  workspaceSymbolIndex,
  workspaceConflict,
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
  savedAt: WorkbenchProps["savedAt"];
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
  const [undoRedoState, setUndoRedoState] = useState<MonacoUndoRedoState>({
    canRedo: false,
    canUndo: false
  });
  const [previewWidthPercent, setPreviewWidthPercent] = useState(DEFAULT_PREVIEW_WIDTH_PERCENT);
  const { beginResize: beginPreviewResize, containerRef: editorBodyRef } = useHorizontalResize<HTMLDivElement>({
    disabled: !previewVisible,
    onResize: (width, editorBody) => {
      editorBody.style.setProperty("--reference-preview-width", `${width}%`);
    },
    onResizeEnd: (width) => setPreviewWidthPercent(width),
    panelId: "preview",
    resolveValue: ({ containerSize, deltaX, startValue }) => {
      const startPreviewWidth = containerSize * startValue / 100;
      return clampPreviewWidthPercent((startPreviewWidth - deltaX) / containerSize * 100);
    },
    value: previewWidthPercent
  });
  const diagnostics = compileOutput.diagnostics;
  const diagnosticStats = getDiagnosticStats(diagnostics);
  const lineCount = useMemo(() => source.split(/\r?\n/).length, [source]);
  const autoSaveEnabled = settings.autoSaveMode !== "off";
  const autoSaved = autoSaveEnabled && !dirty && Boolean(savedAt);
  const saveStatusLabel = autoSaved ? formatSaveStatusLabel(savedAt) : "Save";
  const handleRedo = () => {
    editorRef.current?.redo();
  };
  const handleUndo = () => {
    editorRef.current?.undo();
  };

  return (
    <section className="relative z-10 min-w-0 flex-1 overflow-visible bg-transparent pb-2 pl-2 pr-2">
      {sidebarVisible ? <ReferenceSidebarResizeHandle onPointerDown={onSidebarResize} /> : null}
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-sm border border-border/50 bg-[var(--reference-surface-bg)] shadow-[0_2px_14px] shadow-foreground/5">
        <div className="grid h-[50px] shrink-0 grid-cols-[8.5rem_minmax(0,1fr)_8.5rem] items-center gap-3 bg-[var(--reference-surface-bg)] px-6 max-[880px]:grid-cols-[8.25rem_minmax(0,1fr)_8.25rem] max-[720px]:px-3">
          <div className="flex min-w-0 items-center gap-1 text-muted-foreground" aria-label="Editor history controls">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              title="Back"
              aria-label="Back"
            >
              <ChevronLeft size={15} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              title="Forward"
              aria-label="Forward"
            >
              <ChevronRight size={15} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              title="Undo"
              aria-label="Undo"
              disabled={!undoRedoState.canUndo}
              onClick={handleUndo}
            >
              <Undo2 size={15} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              title="Redo"
              aria-label="Redo"
              disabled={!undoRedoState.canRedo}
              onClick={handleRedo}
            >
              <Redo2 size={15} />
            </Button>
          </div>
          <div className="min-w-0 truncate whitespace-nowrap text-center text-base font-semibold text-foreground" title={file.name}>{file.name}</div>
          <div className="flex min-w-0 items-center justify-end gap-1 text-muted-foreground" aria-label="Editor view controls">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={saveActionClassName}
              data-autosaved={autoSaved ? "true" : undefined}
              title={autoSaved ? saveStatusLabel : "Save current file"}
              aria-label={autoSaved ? saveStatusLabel : "Save current file"}
              onClick={onSave}
            >
              {autoSaved ? <CheckCircle2 size={15} /> : <Save size={15} />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              data-active={bottomPanel === "diagnostics" ? "true" : undefined}
              aria-pressed={bottomPanel === "diagnostics"}
              aria-label="Toggle diagnostics panel"
              title="Toggle diagnostics panel"
              onClick={onToggleDiagnostics}
            >
              <PanelBottom size={14} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={tabActionClassName}
              data-active={previewVisible ? "true" : undefined}
              aria-pressed={previewVisible}
              aria-label={previewVisible ? "Hide Chemd preview" : "Show Chemd preview"}
              title={previewVisible ? "Hide Chemd preview" : "Show Chemd preview"}
              onClick={onTogglePreview}
            >
              <Eye size={14} />
            </Button>
          </div>
        </div>
        {workspaceConflict ? (
          <div className="flex shrink-0 items-center gap-2 border-y border-warning/40 bg-warning/15 px-3 py-2 text-xs text-warning" role="alert">
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
        <div ref={editorBodyRef} className="flex min-h-0 flex-1 overflow-hidden bg-editor-surface">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <Suspense fallback={<div className="monaco-loading flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">Loading Monaco editor...</div>}>
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
                onUndoRedoStateChange={setUndoRedoState}
              />
            </Suspense>
          </div>
          {previewVisible ? (
            <section
              className="relative min-h-0 shrink-0 overflow-hidden border-l border-border/65 bg-[var(--reference-surface-bg)] pl-1"
              style={{ width: `var(--reference-preview-width, ${previewWidthPercent}%)` } as CSSProperties}
              aria-label="Chemd HTML preview"
            >
              <div
                className="absolute bottom-0 left-0 top-0 z-10 w-3 cursor-col-resize bg-transparent after:absolute after:bottom-0 after:left-0 after:top-0 after:w-1 after:bg-primary/70 after:opacity-0 after:transition-opacity hover:after:opacity-100"
                role="separator"
                aria-label="Resize HTML preview"
                aria-orientation="vertical"
                onPointerDown={beginPreviewResize}
              />
              <HtmlPreview output={compileOutput} />
            </section>
          ) : null}
        </div>
        <ReferenceEditorStatusBar
          status={compileOutput.status}
          diagnostics={diagnosticStats}
          diagnosticCount={diagnostics.length}
          cursorPosition={cursorPosition}
          lineCount={lineCount}
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
}: {
  status: ChemdLanguageCompileOutput["status"];
  diagnostics: ReturnType<typeof getDiagnosticStats>;
  diagnosticCount: number;
  cursorPosition: MonacoCursorPosition;
  lineCount: number;
}) {
  const StatusIcon = status === "ok" ? CheckCircle2 : CircleDot;
  const statusLabel = status === "ok" ? "Compiled" : "Compile failed";
  const currentTime = useCurrentMinute();

  return (
    <footer className="flex min-h-7 shrink-0 items-center justify-between gap-3 overflow-hidden border-t border-border/65 bg-[var(--reference-surface-bg)] px-3.5 text-xs font-semibold text-muted-foreground" aria-label="Editor status">
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
          {formatStatusClockTime(currentTime)}
        </span>
      </div>
    </footer>
  );
}
