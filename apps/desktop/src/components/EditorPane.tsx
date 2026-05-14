import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  PanelBottom,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { PanelHeader } from "@/components/PanelHeader";
import {
  MonacoChemdEditor,
  type MonacoChemdEditorHandle,
} from "../MonacoChemdEditor";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdWorkspaceSymbolIndex,
} from "@chemd/language-service";
import type { RefObject } from "react";
import type { DocumentMode, WorkspaceConflictState } from "../desktop-types";
import { getDiagnosticStats } from "../desktop-utils";

// ─── Components ─────────────────────────────────────────────────────────

export const EditorPane = ({
  fileName,
  mode,
  source,
  compileOutput,
  workspaceSymbolIndex,
  lineCount,
  compiledAt,
  workspaceConflict,
  editorRef,
  onChange,
  onSave,
  onReloadWorkspaceConflict,
  onKeepLocalWorkspaceConflict,
}: {
  fileName: string;
  mode: DocumentMode;
  source: string;
  compileOutput: ChemdLanguageCompileOutput;
  workspaceSymbolIndex: ChemdWorkspaceSymbolIndex | null;
  lineCount: number;
  compiledAt: string;
  workspaceConflict: WorkspaceConflictState | null;
  editorRef: RefObject<MonacoChemdEditorHandle | null>;
  onChange: (next: string) => void;
  onSave: () => void;
  onReloadWorkspaceConflict: () => void;
  onKeepLocalWorkspaceConflict: () => void;
}) => (
  <section className="flex flex-col flex-1 min-h-0" aria-label="Editor">
    <PanelHeader
      eyebrow="Editor"
      title={fileName}
      meta={`${lineCount} lines`}
    />
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
      <Activity size={15} />
      <span>
        {mode === "sample" ? "Bundled sample buffer" : "Local workspace file"}
      </span>
      <span className="h-3 w-px bg-border" />
      <span>Compiled {new Date(compiledAt).toLocaleTimeString()}</span>
    </div>
    {workspaceConflict ? (
      <WorkspaceConflictPanel
        conflict={workspaceConflict}
        onReload={onReloadWorkspaceConflict}
        onKeepLocal={onKeepLocalWorkspaceConflict}
      />
    ) : null}
    <MonacoChemdEditor
      ref={editorRef}
      value={source}
      documentPath={compileOutput.documentUri ?? fileName}
      compileOutput={compileOutput}
      workspaceSymbolIndex={workspaceSymbolIndex}
      onChange={onChange}
      onSave={onSave}
    />
  </section>
);

export const WorkspaceConflictPanel = ({
  conflict,
  onReload,
  onKeepLocal,
}: {
  conflict: WorkspaceConflictState;
  onReload: () => void;
  onKeepLocal: () => void;
}) => (
  <Alert variant="destructive" className="mx-3 my-2">
    <AlertTriangle size={15} aria-hidden="true" />
    <AlertTitle>Workspace file changed on disk</AlertTitle>
    <AlertDescription>
      <p>{conflict.message}</p>
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          disabled={conflict.reloading}
          aria-busy={conflict.reloading}
          onClick={onReload}
        >
          <RefreshCw size={14} />
          {conflict.reloading ? "Reloading" : "Reload from disk"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={conflict.reloading}
          onClick={onKeepLocal}
        >
          Keep local editing
        </Button>
      </div>
    </AlertDescription>
  </Alert>
);

export const BottomPanel = ({
  diagnostics,
  compileStatus,
  errorMessage,
}: {
  diagnostics: ChemdEditorDiagnostic[];
  compileStatus: "ok" | "failed";
  errorMessage?: string;
}) => {
  const stats = getDiagnosticStats(diagnostics);
  return (
    <section className="border-t" aria-label="Diagnostics pane">
      <div className="flex items-center gap-3 border-b px-3 py-1">
        <Button variant="ghost" size="xs" data-active="true">
          <PanelBottom size={14} />
          Diagnostics
        </Button>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertTriangle size={14} />
          {stats.errors} errors / {stats.warnings} warnings / {stats.infos} info
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {compileStatus === "ok" ? (
            <CheckCircle2 size={14} />
          ) : (
            <CircleDot size={14} />
          )}
          {compileStatus}
        </span>
      </div>
      <div
        className="max-h-48 overflow-y-auto"
        role={compileStatus === "failed" ? "alert" : "list"}
      >
        {errorMessage ? (
          <p className="px-3 py-1 text-xs text-destructive" data-severity="error">
            {errorMessage}
          </p>
        ) : null}
        {diagnostics.length > 0 ? (
          diagnostics.map((diagnostic) => (
            <div
              key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.message}`}
              className="flex items-center gap-2 px-3 py-1 text-xs"
              data-severity={diagnostic.severity}
            >
              <Badge
                variant={
                  diagnostic.severity === "error" ? "destructive" : "secondary"
                }
                className="shrink-0"
              >
                {diagnostic.severity}
              </Badge>
              <strong>{diagnostic.code}</strong>
              <span className="flex-1 truncate">{diagnostic.message}</span>
              <span className="shrink-0 text-muted-foreground">
                L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}
              </span>
            </div>
          ))
        ) : (
          <p className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
            <CheckCircle2 size={14} />
            Language service reports no diagnostics for this buffer.
          </p>
        )}
      </div>
    </section>
  );
};
