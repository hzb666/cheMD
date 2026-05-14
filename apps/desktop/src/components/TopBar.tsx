import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronRight,
  FileCode2,
  Files,
  GitGraph,
  GripHorizontal,
  GripVertical,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  ActivityTool,
  DocumentMode,
  LayoutPanel,
  SidebarPrimaryTab,
  SidebarSecondaryTab,
  SidebarTabItem,
} from "../desktop-types";
import type {
  ChemdEditorDiagnostic,
  ChemdOutlineItem,
} from "@chemd/language-service";
import type { WorkspaceFileEntry, WorkspaceHandle } from "../desktop-contracts";
import { getDiagnosticStats, layoutBounds } from "../desktop-utils";

// ─── Constants ──────────────────────────────────────────────────────────

export const activityItems: {
  id: ActivityTool;
  label: string;
  icon: typeof Files;
}[] = [
  { id: "files", label: "Files", icon: Files },
  { id: "search", label: "RAG Search", icon: Search },
  { id: "graph", label: "Reaction Graph", icon: GitGraph },
  { id: "agent", label: "Agent Runs", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings },
];

// ─── Components ─────────────────────────────────────────────────────────

export const TopBar = ({
  workspace,
  workspaceState,
  dirty,
  canSave,
  onSave,
  onOpenWorkspace,
}: {
  workspace: WorkspaceHandle;
  workspaceState: string;
  sidecarStatus: unknown;
  postgresStatus: unknown;
  diagnosticCount: number;
  dirty: boolean;
  rootPath: string;
  canSave: boolean;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
}) => (
  <header className="flex items-center justify-between border-b px-3 py-1.5">
    <div className="flex items-center gap-1">
      <div
        className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
        data-active="true"
      >
        <FileCode2 size={14} />
        <span>{workspace.displayName}</span>
        <Button variant="ghost" size="icon-xs">
          <XCircle size={12} />
        </Button>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <StatusBadge
        label={dirty ? "Unsaved" : "Saved"}
        tone={dirty ? "degraded" : "ready"}
        detail="Local editor buffer state"
      />
      <Button
        size="sm"
        disabled={workspaceState === "opening"}
        onClick={onOpenWorkspace}
      >
        Open Workspace
      </Button>
      <Button variant="outline" size="sm" disabled={!canSave} onClick={onSave}>
        Save
      </Button>
    </div>
  </header>
);

export const ActivityRail = ({
  activeTool,
  onSelectTool,
}: {
  activeTool: ActivityTool;
  onSelectTool: (tool: ActivityTool) => void;
}) => (
  <nav className="flex flex-col items-center gap-1 border-r py-2" aria-label="Primary tools">
    {activityItems.map(({ id, label, icon: Icon }) => (
      <Button
        key={id}
        variant={id === activeTool ? "secondary" : "ghost"}
        size="icon-sm"
        aria-label={label}
        aria-pressed={id === activeTool}
        title={label}
        onClick={() => onSelectTool(id)}
      >
        <Icon size={18} />
      </Button>
    ))}
  </nav>
);

export const ResizeHandle = ({
  panel,
  collapsed,
  value,
  onPointerDown,
  onKeyDown,
  onToggle,
  onReset,
}: {
  panel: LayoutPanel;
  collapsed: boolean;
  value: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  onReset: () => void;
}) => {
  const orientation = panel === "bottom" ? "horizontal" : "vertical";
  const label =
    panel === "sidebar"
      ? "Files sidebar"
      : panel === "insight"
        ? "Insight sidebar"
        : "Bottom panel";
  const ToggleIcon =
    panel === "sidebar"
      ? collapsed
        ? PanelLeftOpen
        : PanelLeftClose
      : panel === "insight"
        ? collapsed
          ? PanelRightOpen
          : PanelRightClose
        : collapsed
          ? PanelBottomOpen
          : PanelBottomClose;
  const GripIcon = orientation === "vertical" ? GripVertical : GripHorizontal;

  return (
    <div
      className="flex items-center justify-center"
      data-panel={panel}
      data-orientation={orientation}
      data-collapsed={collapsed}
      role="separator"
      aria-label={`${label} resize`}
      aria-orientation={orientation}
      aria-valuemin={layoutBounds[panel].min}
      aria-valuemax={layoutBounds[panel].max}
      aria-valuenow={collapsed ? 0 : value}
      tabIndex={0}
      title={`${label}: drag to resize, double-click to reset`}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <GripIcon className="text-muted-foreground" size={14} aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => event.stopPropagation()}
        onClick={onToggle}
      >
        <ToggleIcon size={14} />
      </Button>
    </div>
  );
};

export function SidebarTabs<T extends string>({
  items,
  active,
  onSelect,
}: {
  items: SidebarTabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-b px-1 py-0.5" role="tablist">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.id}
            variant={item.id === active ? "secondary" : "ghost"}
            size="xs"
            role="tab"
            aria-selected={item.id === active}
            data-active={item.id === active}
            onClick={() => onSelect(item.id)}
          >
            <Icon size={13} />
            <span>{item.label}</span>
            {item.badge ? (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[0.6rem]">
                {item.badge}
              </Badge>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
}

export const Sidebar = ({
  files,
  selectedFileId,
  mode,
  message,
  outline,
  diagnostics,
  compileStatus,
  onSelectFile,
}: {
  files: WorkspaceFileEntry[];
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  outline: ChemdOutlineItem[];
  diagnostics: ChemdEditorDiagnostic[];
  compileStatus: "ok" | "failed";
  onSelectFile: (file: WorkspaceFileEntry) => void;
}) => {
  const [primaryTab, setPrimaryTab] =
    useState<SidebarPrimaryTab>("files");
  const [secondaryTab, setSecondaryTab] =
    useState<SidebarSecondaryTab>("workspace");
  const selectedFile = files.find((file) => file.id === selectedFileId);
  const stats = getDiagnosticStats(diagnostics);
  const primaryTabs: SidebarTabItem<SidebarPrimaryTab>[] = [
    { id: "files", label: "Files", icon: Files, badge: `${files.length}` },
    {
      id: "outline",
      label: "Outline",
      icon: ScrollText,
      badge: `${outline.length}`,
    },
    {
      id: "problems",
      label: "Problems",
      icon: AlertTriangle,
      badge: `${diagnostics.length}`,
    },
  ];
  const secondaryTabs: SidebarTabItem<SidebarSecondaryTab>[] = [
    { id: "workspace", label: "Workspace", icon: Sparkles },
    { id: "summary", label: "Summary", icon: Activity },
  ];

  return (
    <aside className="flex flex-col border-r" style={{ width: "var(--desktop-sidebar-width)" }}>
      <section className="flex flex-col flex-1 min-h-0" aria-label="Sidebar primary window">
        <SidebarTabs
          items={primaryTabs}
          active={primaryTab}
          onSelect={setPrimaryTab}
        />
        <ScrollArea className="flex-1 min-h-0">
          {primaryTab === "files" ? (
            <ul className="flex flex-col" aria-label="Workspace files">
              {files.map((file) => (
                <li key={file.id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-1.5"
                    data-kind={file.kind}
                    data-selected={file.id === selectedFileId}
                    onClick={() => onSelectFile(file)}
                  >
                    <span aria-hidden="true">
                      {file.kind === "directory" ? (
                        <Files size={14} />
                      ) : (
                        <FileCode2 size={14} />
                      )}
                    </span>
                    <span className="flex-1 text-left truncate">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {file.chemdKind ?? file.kind}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {primaryTab === "outline" ? (
            outline.length > 0 ? (
              <OutlineTree items={outline} />
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No outline from language service.
              </p>
            )
          ) : null}
          {primaryTab === "problems" ? (
            <div
              className="flex flex-col"
              role={diagnostics.length > 0 ? "list" : undefined}
            >
              {diagnostics.length > 0 ? (
                diagnostics.map((diagnostic) => (
                  <div
                    key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.message}`}
                    className="flex items-start gap-2 px-3 py-1.5 text-xs"
                    data-severity={diagnostic.severity}
                    role="listitem"
                  >
                    <Badge
                      variant={
                        diagnostic.severity === "error"
                          ? "destructive"
                          : "secondary"
                      }
                      className="shrink-0"
                    >
                      {diagnostic.severity}
                    </Badge>
                    <strong>{diagnostic.code}</strong>
                    <p className="flex-1 truncate">{diagnostic.message}</p>
                    <code className="shrink-0 text-muted-foreground">
                      L{diagnostic.range.startLine}:C
                      {diagnostic.range.startColumn}
                    </code>
                  </div>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Language service reports no diagnostics.
                </p>
              )}
            </div>
          ) : null}
        </ScrollArea>
      </section>
      <Separator />
      <section className="flex flex-col min-h-0" aria-label="Sidebar secondary window">
        <SidebarTabs
          items={secondaryTabs}
          active={secondaryTab}
          onSelect={setSecondaryTab}
        />
        <div className="flex-1 min-h-0 p-2">
          {secondaryTab === "workspace" ? (
            <div
              className="flex items-center gap-2 rounded-md bg-muted p-2 text-xs"
              data-mode={mode}
            >
              <Sparkles size={14} />
              <span>{message}</span>
            </div>
          ) : null}
          {secondaryTab === "summary" ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              <div>
                <dt className="text-muted-foreground">Mode</dt>
                <dd>{mode}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Selected</dt>
                <dd>{selectedFile?.name ?? "none"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Compile</dt>
                <dd>{compileStatus}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Problems</dt>
                <dd>
                  {stats.errors}E / {stats.warnings}W / {stats.infos}I
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </section>
    </aside>
  );
};

function OutlineTree({ items }: { items: ChemdOutlineItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <div className="flex items-center gap-1 px-2 py-0.5 text-xs">
            <ChevronRight size={13} />
            <span className="text-muted-foreground">{item.kind}</span>
            <span className="flex-1 truncate">{item.label}</span>
            <span className="text-muted-foreground">
              L{item.range.startLine}
            </span>
          </div>
          {item.children?.length ? (
            <div className="pl-3">
              <OutlineTree items={item.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
