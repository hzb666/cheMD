import {
  Activity,
  Beaker,
  Bot,
  FileCode2,
  Files,
  FlaskConical,
  GitGraph,
  Microscope,
  PanelBottom,
  Search,
  Settings,
  Sparkles
} from "lucide-react";

import {
  shellFiles,
  shellSidecarStatus,
  shellWorkspace,
  type RuntimeState,
  type WorkspaceFileEntry
} from "./desktop-contracts";

interface StatusBadgeProps {
  label: string;
  state: RuntimeState;
  detail: string;
}

interface PanelHeaderProps {
  eyebrow: string;
  title: string;
  meta: string;
}

const statusToneByState: Record<RuntimeState, string> = {
  ready: "success",
  placeholder: "pending",
  degraded: "warning",
  offline: "danger"
};

const activityItems = [
  { id: "files", label: "Files", icon: Files, active: true },
  { id: "search", label: "RAG Search", icon: Search, active: false },
  { id: "graph", label: "Reaction Graph", icon: GitGraph, active: false },
  { id: "agent", label: "Agent Runs", icon: Bot, active: false },
  { id: "settings", label: "Settings", icon: Settings, active: false }
];

const previewTabs = [
  "Preview",
  "Diagnostics",
  "JSON",
  "Runtime",
  "RAG",
  "Training"
];

const StatusBadge = ({ label, state, detail }: StatusBadgeProps) => (
  <span
    className="desktop-status-badge"
    data-state={statusToneByState[state]}
    title={detail}
  >
    <span className="desktop-status-dot" />
    {label}
  </span>
);

const PanelHeader = ({ eyebrow, title, meta }: PanelHeaderProps) => (
  <div className="desktop-panel-header">
    <div className="desktop-panel-title-group">
      <p className="desktop-panel-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
    <span className="desktop-panel-meta">{meta}</span>
  </div>
);

const TopBar = () => (
  <header className="desktop-topbar">
    <div className="desktop-brand">
      <div className="desktop-logo-mark" aria-hidden="true">
        <FlaskConical size={16} />
      </div>
      <div className="desktop-brand-copy">
        <span className="desktop-product-name">Chemd Desktop IDE</span>
        <span className="desktop-workspace-name">{shellWorkspace.displayName}</span>
      </div>
    </div>
    <div className="desktop-topbar-center">
      <span className="desktop-path-chip" title={shellWorkspace.rootHint}>
        {shellWorkspace.rootHint}
      </span>
    </div>
    <div className="desktop-runtime-badges" aria-label="Runtime status">
      <StatusBadge label="Compile idle" state="placeholder" detail="Language worker is not connected" />
      <StatusBadge label="Postgres off" state="offline" detail="Database runtime is outside this shell slice" />
      <StatusBadge
        label={shellSidecarStatus.label}
        state={shellSidecarStatus.state}
        detail={shellSidecarStatus.detail}
      />
      <StatusBadge label="OCR off" state="offline" detail="OCR provider is not connected" />
    </div>
  </header>
);

const ActivityRail = () => (
  <nav className="desktop-activity-rail" aria-label="Primary tools">
    {activityItems.map((item) => {
      const Icon = item.icon;
      return (
        <button
          key={item.id}
          type="button"
          className="desktop-rail-button"
          data-active={item.active}
          aria-label={item.label}
          title={item.label}
        >
          <Icon size={18} />
        </button>
      );
    })}
  </nav>
);

const FileRow = ({ file }: { file: WorkspaceFileEntry }) => (
  <li className="desktop-file-row" data-kind={file.kind}>
    <span className="desktop-file-icon" aria-hidden="true">
      {file.kind === "directory" ? <Files size={14} /> : <FileCode2 size={14} />}
    </span>
    <span className="desktop-file-name">{file.name}</span>
    <span className="desktop-file-kind">{file.chemdKind ?? file.kind}</span>
  </li>
);

const Sidebar = () => (
  <aside className="desktop-sidebar">
    <PanelHeader eyebrow="Workspace" title="Files" meta="Phase 1" />
    <div className="desktop-sidebar-action-row">
      <button type="button" className="desktop-button-primary">
        Open
      </button>
      <button type="button" className="desktop-button">
        Refresh
      </button>
    </div>
    <ul className="desktop-file-tree" aria-label="Workspace files">
      {shellFiles.map((file) => (
        <FileRow key={file.id} file={file} />
      ))}
    </ul>
    <div className="desktop-sidebar-note">
      <Beaker size={14} />
      Tauri commands own workspace access.
    </div>
  </aside>
);

const EditorPane = () => (
  <section className="desktop-pane desktop-editor-pane" aria-label="Editor">
    <PanelHeader eyebrow="Editor" title="suzuki-screen.chemd.md" meta="dirty placeholder" />
    <div className="desktop-editor-toolbar">
      <button type="button" className="desktop-icon-button" aria-label="Run compile" title="Run compile">
        <Activity size={15} />
      </button>
      <button type="button" className="desktop-icon-button" aria-label="Open structure tools" title="Structure tools">
        <Microscope size={15} />
      </button>
      <span className="desktop-toolbar-divider" />
      <span className="desktop-toolbar-text">Monaco boundary placeholder</span>
    </div>
    <div className="desktop-editor-surface">
      <pre>{`:::chemd kind: reaction id: suzuki-screen-001
title: Suzuki coupling condition screen
reactants:
  - 4-bromotoluene
  - phenylboronic acid
conditions:
  catalyst: Pd(PPh3)4
  base: K2CO3
result:
  yield: pending
:::`}</pre>
    </div>
  </section>
);

const PreviewInspectPane = () => (
  <section className="desktop-pane desktop-preview-pane" aria-label="Preview and inspect">
    <PanelHeader eyebrow="Inspect" title="Preview" meta="compiler disconnected" />
    <div className="desktop-tab-list" role="tablist" aria-label="Preview tabs">
      {previewTabs.map((tab, index) => (
        <button
          key={tab}
          type="button"
          className="desktop-tab"
          data-active={index === 0}
          role="tab"
          aria-selected={index === 0}
        >
          {tab}
        </button>
      ))}
    </div>
    <div className="desktop-preview-surface">
      <div className="desktop-document-preview">
        <p className="desktop-preview-kicker">Rendered document placeholder</p>
        <h3>Suzuki coupling condition screen</h3>
        <p>
          The desktop shell keeps preview, diagnostics, JSON, RAG and runtime
          output behind explicit panel boundaries.
        </p>
        <dl>
          <div>
            <dt>Compiler</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>chem-service</dt>
            <dd>{shellSidecarStatus.detail}</dd>
          </div>
        </dl>
      </div>
    </div>
  </section>
);

const BottomPanel = () => (
  <section className="desktop-bottom-panel" aria-label="Bottom panel">
    <div className="desktop-bottom-tabs">
      <button type="button" className="desktop-bottom-tab" data-active="true">
        <PanelBottom size={14} />
        Problems
      </button>
      <button type="button" className="desktop-bottom-tab">
        Output
      </button>
      <button type="button" className="desktop-bottom-tab">
        Sidecar Logs
      </button>
      <button type="button" className="desktop-bottom-tab">
        Agent Timeline
      </button>
    </div>
    <div className="desktop-log-line">
      <Sparkles size={14} />
      Desktop shell skeleton loaded. Runtime integrations are intentionally
      placeholder-only in this slice.
    </div>
  </section>
);

export const App = () => (
  <main className="desktop-shell">
    <TopBar />
    <div className="desktop-workbench">
      <ActivityRail />
      <Sidebar />
      <div className="desktop-main-grid">
        <EditorPane />
        <PreviewInspectPane />
        <BottomPanel />
      </div>
    </div>
  </main>
);
