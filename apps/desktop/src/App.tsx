import { invoke } from "@tauri-apps/api/core";
import { Activity, AlertTriangle, Bot, CheckCircle2, ChevronRight, CircleDot, FileCode2, Files, FlaskConical, GitGraph, Lightbulb, PanelBottom, Search, Settings, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { compileChemdForEditor, type ChemdEditorDiagnostic, type ChemdOutlineItem, type ChemdQuickFixProposal, type ChemdTextEdit } from "@chemd/language-service";

import { shellFiles, shellSidecarStatus, shellWorkspace, type DesktopCommandMap, type RuntimeState, type SidecarStatus, type WorkspaceFileEntry, type WorkspaceHandle } from "./desktop-contracts";

type WorkspaceState = "empty" | "opening" | "open" | "error"; type DocumentMode = "sample" | "workspace-fallback";

const sampleSources: Record<string, string> = {
  "suzuki-screen.chemd.md": "---\nid: exp-desktop-suzuki\ntitle: Suzuki coupling condition screen\ndate: 2026-05-12\n---\n\n:::chemd #mol-aryl-bromide\nsmiles: Cc1ccc(Br)cc1\n:::\n\n:::chemd #rxn-screen\nkind: reaction\nreactants: mol-aryl-bromide, phenylboronic-acid\nproducts: biaryl-product\nconditions:\n  catalyst: Pd(PPh3)4\n  base: K2CO3\n  solvent: dioxane/water\n:::\n\n:::result #screen-result\nstatus: pending\nyield: 78%\n:::\n",
  "calibration.chemd.md": "---\nid: exp-desktop-calibration\ntitle: HPLC calibration record\ndate: 2026-05-12\n---\n\n:::sample #std-a\nname: caffeine standard\namount: 2.0 mg\n:::\n\n:::analysis #calibration\nmethod: HPLC-UV\ntarget: caffeine\nresult: linear fit accepted\n:::\n"
};

const activityItems = [{ id: "files", label: "Files", icon: Files, active: true }, { id: "search", label: "RAG Search", icon: Search, active: false }, { id: "graph", label: "Reaction Graph", icon: GitGraph, active: false }, { id: "agent", label: "Agent Runs", icon: Bot, active: false }, { id: "settings", label: "Settings", icon: Settings, active: false }];

const statusToneByState: Record<RuntimeState, string> = { ready: "success", placeholder: "pending", degraded: "warning", offline: "danger" };
const workspaceStateLabel: Record<WorkspaceState, string> = { empty: "Empty", opening: "Opening", open: "Open", error: "Fallback" };

const invokeDesktop = async <Command extends keyof DesktopCommandMap>(
  command: Command,
  input: DesktopCommandMap[Command]["input"]
): Promise<DesktopCommandMap[Command]["output"]> =>
  input === undefined ? invoke(command) : invoke(command, input as Record<string, unknown>);

const getSampleSource = (file: WorkspaceFileEntry): string =>
  sampleSources[file.name] ?? sampleSources["suzuki-screen.chemd.md"];

const getLineStarts = (source: string): number[] => {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
};

const getOffset = (source: string, line: number, column: number): number => {
  const lineStart = getLineStarts(source)[Math.max(0, line - 1)] ?? source.length;
  return Math.min(source.length, lineStart + Math.max(0, column - 1));
};

const applyTextEdits = (source: string, edits: ChemdTextEdit[]): string =>
  [...edits]
    .sort((left, right) =>
      getOffset(source, right.range.startLine, right.range.startColumn)
      - getOffset(source, left.range.startLine, left.range.startColumn)
    )
    .reduce((next, edit) => {
      const start = getOffset(next, edit.range.startLine, edit.range.startColumn);
      const end = getOffset(next, edit.range.endLine, edit.range.endColumn);
      return `${next.slice(0, start)}${edit.replacement}${next.slice(end)}`;
    }, source);

const PanelHeader = ({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) => (
  <div className="desktop-panel-header">
    <div className="desktop-panel-title-group"><p className="desktop-panel-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
    <span className="desktop-panel-meta">{meta}</span>
  </div>
);

const StatusBadge = ({ label, state, detail }: { label: string; state: RuntimeState; detail: string }) => (
  <span className="desktop-status-badge" data-state={statusToneByState[state]} title={detail}><span className="desktop-status-dot" />{label}</span>
);

const TopBar = ({
  workspace,
  workspaceState,
  sidecarStatus,
  diagnosticCount,
  dirty,
  onOpenWorkspace
}: {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarStatus: SidecarStatus;
  diagnosticCount: number;
  dirty: boolean;
  onOpenWorkspace: () => void;
}) => (
  <header className="desktop-topbar">
    <div className="desktop-brand">
      <div className="desktop-logo-mark" aria-hidden="true"><FlaskConical size={16} /></div>
      <div className="desktop-brand-copy"><span className="desktop-product-name">Chemd Desktop IDE</span><span className="desktop-workspace-name">{workspace.displayName}</span></div>
    </div>
    <div className="desktop-topbar-center"><span className="desktop-path-chip" title={workspace.rootHint}>{workspace.rootHint}</span></div>
    <div className="desktop-runtime-badges" aria-label="Runtime status">
      <button type="button" className="desktop-button-primary" disabled={workspaceState === "opening"} onClick={onOpenWorkspace}>{workspaceState === "opening" ? "Opening" : "Open"}</button>
      <StatusBadge label={workspaceStateLabel[workspaceState]} state={workspaceState === "open" ? "ready" : workspaceState === "error" ? "degraded" : "placeholder"} detail="Workspace access uses open_workspace and list_workspace_files" />
      <StatusBadge label={`${diagnosticCount} diagnostics`} state={diagnosticCount > 0 ? "degraded" : "ready"} detail="Computed by @chemd/language-service" />
      <StatusBadge label={dirty ? "Dirty" : "Saved"} state={dirty ? "degraded" : "ready"} detail="Local editor buffer state" />
      <StatusBadge label={sidecarStatus.label} state={sidecarStatus.state} detail={sidecarStatus.detail} />
    </div>
  </header>
);

const ActivityRail = () => (
  <nav className="desktop-activity-rail" aria-label="Primary tools">
    {activityItems.map(({ id, label, icon: Icon, active }) => (
      <button key={id} type="button" className="desktop-rail-button" data-active={active} aria-label={label} title={label}><Icon size={18} /></button>
    ))}
  </nav>
);

const Sidebar = ({
  files,
  selectedFileId,
  mode,
  message,
  onSelectFile
}: {
  files: WorkspaceFileEntry[];
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  onSelectFile: (file: WorkspaceFileEntry) => void;
}) => (
  <aside className="desktop-sidebar">
    <PanelHeader eyebrow="Workspace" title="Files" meta={mode === "sample" ? "Sample" : "Tauri"} />
    <div className="desktop-sidebar-note" data-mode={mode}><Sparkles size={14} /><span>{message}</span></div>
    <ul className="desktop-file-tree" aria-label="Workspace files">
      {files.map((file) => (
        <li key={file.id}>
          <button type="button" className="desktop-file-row" data-kind={file.kind} data-selected={file.id === selectedFileId} onClick={() => onSelectFile(file)}>
            <span className="desktop-file-icon" aria-hidden="true">{file.kind === "directory" ? <Files size={14} /> : <FileCode2 size={14} />}</span>
            <span className="desktop-file-name">{file.name}</span><span className="desktop-file-kind">{file.chemdKind ?? file.kind}</span>
          </button>
        </li>
      ))}
    </ul>
  </aside>
);

const EditorPane = ({
  fileName,
  mode,
  source,
  lineCount,
  compiledAt,
  onChange
}: {
  fileName: string;
  mode: DocumentMode;
  source: string;
  lineCount: number;
  compiledAt: string;
  onChange: (next: string) => void;
}) => (
  <section className="desktop-pane desktop-editor-pane" aria-label="Editor">
    <PanelHeader eyebrow="Editor" title={fileName} meta={`${lineCount} lines`} />
    <div className="desktop-editor-toolbar"><Activity size={15} /><span className="desktop-toolbar-text">{mode === "sample" ? "Bundled sample buffer" : "Workspace file selected; content fallback is sample"}</span><span className="desktop-toolbar-divider" /><span className="desktop-toolbar-text">Compiled {new Date(compiledAt).toLocaleTimeString()}</span></div>
    <textarea className="desktop-editor-textarea" value={source} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)} spellCheck={false} aria-label="Chemd source editor" />
  </section>
);

const OutlineTree = ({ items }: { items: ChemdOutlineItem[] }) => (
  <ul className="desktop-outline-list">
    {items.map((item) => (
      <li key={item.id} className="desktop-outline-item">
        <div className="desktop-outline-row"><ChevronRight size={13} /><span className="desktop-outline-kind">{item.kind}</span><span className="desktop-outline-label">{item.label}</span><span className="desktop-outline-line">L{item.range.startLine}</span></div>
        {item.children?.length ? <OutlineTree items={item.children} /> : null}
      </li>
    ))}
  </ul>
);

const InsightPane = ({
  outline,
  diagnostics,
  onApplyQuickFix
}: {
  outline: ChemdOutlineItem[];
  diagnostics: ChemdEditorDiagnostic[];
  onApplyQuickFix: (quickFix: ChemdQuickFixProposal) => void;
}) => {
  const quickFixes = diagnostics.flatMap((item) => item.quickFixes);
  return (
    <aside className="desktop-pane desktop-insight-pane" aria-label="Outline and agent">
      <PanelHeader eyebrow="Inspect" title="Outline" meta={`${outline.length} roots`} />
      <div className="desktop-insight-section">{outline.length > 0 ? <OutlineTree items={outline} /> : <p className="desktop-empty-copy">No outline from language service.</p>}</div>
      <div className="desktop-agent-panel">
        <div className="desktop-agent-heading"><Bot size={15} /><span>Agent pane</span></div>
        <p>Agent tools can consume the current source, diagnostics and selected quick fixes once orchestration commands are connected.</p>
        <div className="desktop-quickfix-list">
          {quickFixes.length > 0 ? quickFixes.map((fix) => (
            <button key={fix.id} type="button" onClick={() => onApplyQuickFix(fix)}><Lightbulb size={14} /><span>{fix.title}</span></button>
          )) : <span className="desktop-empty-copy">No quick fixes available.</span>}
        </div>
      </div>
    </aside>
  );
};

const BottomPanel = ({ diagnostics, compileStatus, errorMessage }: { diagnostics: ChemdEditorDiagnostic[]; compileStatus: "ok" | "failed"; errorMessage?: string }) => {
  const stats = {
    errors: diagnostics.filter((item) => item.severity === "error").length,
    warnings: diagnostics.filter((item) => item.severity === "warning").length,
    infos: diagnostics.filter((item) => item.severity === "info").length
  };
  return (
    <section className="desktop-bottom-panel" aria-label="Diagnostics pane">
      <div className="desktop-bottom-tabs">
        <button type="button" className="desktop-bottom-tab" data-active="true"><PanelBottom size={14} />Diagnostics</button>
        <span className="desktop-diagnostic-summary"><AlertTriangle size={14} />{stats.errors} errors / {stats.warnings} warnings / {stats.infos} info</span>
        <span className="desktop-diagnostic-summary">{compileStatus === "ok" ? <CheckCircle2 size={14} /> : <CircleDot size={14} />}{compileStatus}</span>
      </div>
      <div className="desktop-diagnostics-list" role={compileStatus === "failed" ? "alert" : "list"}>
        {errorMessage ? <p className="desktop-diagnostic-row" data-severity="error">{errorMessage}</p> : null}
        {diagnostics.length > 0 ? diagnostics.map((diagnostic) => (
          <div key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.message}`} className="desktop-diagnostic-row" data-severity={diagnostic.severity}>
            <span>{diagnostic.severity}</span><strong>{diagnostic.code}</strong><span className="desktop-diagnostic-message">{diagnostic.message}</span><span>L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}</span>
          </div>
        )) : <p className="desktop-log-line"><CheckCircle2 size={14} />Language service reports no diagnostics for this buffer.</p>}
      </div>
    </section>
  );
};

export const App = () => {
  const initialSource = sampleSources["suzuki-screen.chemd.md"];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [selectedFileId, setSelectedFileId] = useState(shellFiles[0].id);
  const [source, setSource] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>(shellSidecarStatus);
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");

  useEffect(() => {
    void invokeDesktop("read_sidecar_status", undefined).then(setSidecarStatus).catch(() => setSidecarStatus(shellSidecarStatus));
  }, []);

  const selectedFile = files.find((file) => file.id === selectedFileId) ?? shellFiles[0];
  const output = useMemo(() => compileChemdForEditor({
    source,
    documentUri: selectedFile.path,
    options: { strictChemdKind: true }
  }), [selectedFile.path, source]);
  const compileError = output.status === "failed" ? output.error.message : undefined;

  const openWorkspace = async () => {
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeDesktop("open_workspace", undefined);
      const nextFiles = await invokeDesktop("list_workspace_files", { workspaceId: nextWorkspace.workspaceId });
      const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
      const firstFile = usableFiles.find((file) => file.kind === "file") ?? usableFiles[0];
      const nextSource = getSampleSource(firstFile);
      setWorkspace(nextWorkspace);
      setFiles(usableFiles);
      setSelectedFileId(firstFile.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setMode("workspace-fallback");
      setMessage("Workspace commands are connected. File content uses bundled sample fallback until read/write commands exist.");
      setWorkspaceState("open");
    } catch (error: unknown) {
      setWorkspace(shellWorkspace);
      setFiles(shellFiles);
      setMode("sample");
      setMessage(error instanceof Error ? `Tauri unavailable: ${error.message}` : "Tauri unavailable. Using bundled sample content.");
      setWorkspaceState("error");
    }
  };

  const selectFile = (file: WorkspaceFileEntry) => {
    if (file.kind !== "file") return;
    const nextSource = getSampleSource(file);
    setSelectedFileId(file.id);
    setSource(nextSource);
    setSavedSource(nextSource);
    setMessage(mode === "sample" ? "Sample document selected from bundled fallback." : "Workspace file selected. Content remains sample fallback because Rust read command is not available.");
  };

  return (
    <main className="desktop-shell">
      <TopBar workspace={workspace} workspaceState={workspaceState} sidecarStatus={sidecarStatus} diagnosticCount={output.diagnostics.length} dirty={source !== savedSource} onOpenWorkspace={() => void openWorkspace()} />
      <div className="desktop-workbench">
        <ActivityRail />
        <Sidebar files={files} selectedFileId={selectedFileId} mode={mode} message={message} onSelectFile={selectFile} />
        <div className="desktop-main-grid">
          <EditorPane fileName={selectedFile.name} mode={mode} source={source} lineCount={source.split(/\r?\n/).length} compiledAt={output.compiledAt} onChange={setSource} />
          <InsightPane outline={output.outline} diagnostics={output.diagnostics} onApplyQuickFix={(fix) => setSource((current) => applyTextEdits(current, fix.patch.edits))} />
          <BottomPanel diagnostics={output.diagnostics} compileStatus={output.status} errorMessage={compileError} />
        </div>
      </div>
    </main>
  );
};
