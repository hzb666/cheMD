import {
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ActivityTool,
  WorkbenchProps,
  InsightPaneProps,
} from "../../types";
import { activityDockPanel } from "../../utils";
import { InsightDockContent } from "../dock-panels/insight-content";
import { getReferenceSidebarTitle } from "../activity-tools/activity-tools";
import {
  buildWorkspaceTree,
  getSelectedAncestorPaths,
  type WorkspaceTreeNode,
} from "./workspace-tree-model";

export function ReferenceExplorer({
  activeTool,
  files,
  selectedFileId,
  mode,
  message,
  visible,
  workspaceName,
  workspaceState,
  insightProps,
  onOpenWorkspace,
  onSelectFile,
}: {
  activeTool: ActivityTool;
  files: WorkbenchProps["files"];
  selectedFileId: string;
  mode: WorkbenchProps["mode"];
  message: string;
  visible: boolean;
  workspaceName: string;
  workspaceState: WorkbenchProps["workspaceState"];
  insightProps: InsightPaneProps;
  onOpenWorkspace: WorkbenchProps["onOpenWorkspace"];
  onSelectFile: WorkbenchProps["onSelectFile"];
}) {
  const sidebarTitle = getReferenceSidebarTitle(activeTool);
  const workspaceOpen = mode === "workspace" && workspaceState === "open";
  const activePanel = activityDockPanel[activeTool];
  return (
    <aside
      className="reference-sidebar flex shrink-0 flex-col overflow-hidden border-r border-transparent bg-transparent transition-[width,opacity] duration-200 ease-out"
      aria-hidden={!visible}
      style={{ width: visible ? "var(--reference-sidebar-width)" : 0, opacity: visible ? 1 : 0 }}
    >
      <div className="reference-sidebar-title flex h-10 shrink-0 items-center px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {sidebarTitle}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {activeTool === "files" ? (
          <>
            <WorkspacePickerControl
              workspaceState={workspaceState}
              onOpenWorkspace={onOpenWorkspace}
            />
            {workspaceOpen ? (
              <WorkspaceTree
                files={files}
                selectedFileId={selectedFileId}
                onSelectFile={onSelectFile}
              />
            ) : (
              <p className="reference-sidebar-caption mt-3 rounded-lg bg-white/25 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {message || "Choose a workspace folder before loading the file tree."}
              </p>
            )}
          </>
        ) : (
          <InsightDockContent panel={activePanel} props={insightProps} />
        )}
      </div>
      <div className="mb-4 flex h-10 shrink-0 items-center px-6 text-foreground">
        <span className="reference-tab-secondary min-w-0 flex-1 truncate text-center text-sm font-semibold">{workspaceName}</span>
      </div>
    </aside>
  );
}

function WorkspacePickerControl({
  workspaceState,
  onOpenWorkspace,
}: {
  workspaceState: WorkbenchProps["workspaceState"];
  onOpenWorkspace: WorkbenchProps["onOpenWorkspace"];
}) {
  const opening = workspaceState === "opening";

  return (
    <Button
      type="button"
      disabled={opening}
      onClick={onOpenWorkspace}
    >
      <FolderOpen size={16} />
      <span>{opening ? "Opening workspace" : "Select Workspace"}</span>
    </Button>
  );
}

function WorkspaceTree({
  files,
  selectedFileId,
  onSelectFile,
}: {
  files: WorkbenchProps["files"];
  selectedFileId: string;
  onSelectFile: WorkbenchProps["onSelectFile"];
}) {
  const tree = useMemo(() => buildWorkspaceTree(files), [files]);
  const selectedAncestors = useMemo(
    () => getSelectedAncestorPaths(tree, selectedFileId),
    [selectedFileId, tree],
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="mt-3 flex flex-col gap-0.5" role="tree" aria-label="Workspace files">
      {tree.map((node) => (
        <WorkspaceTreeRow
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          selectedAncestors={selectedAncestors}
          selectedFileId={selectedFileId}
          onToggle={toggleExpanded}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}

function WorkspaceTreeRow({
  node,
  depth,
  expanded,
  selectedAncestors,
  selectedFileId,
  onToggle,
  onSelectFile,
}: {
  node: WorkspaceTreeNode;
  depth: number;
  expanded: Set<string>;
  selectedAncestors: Set<string>;
  selectedFileId: string;
  onToggle: (path: string) => void;
  onSelectFile: WorkbenchProps["onSelectFile"];
}) {
  const isFile = node.entry?.kind === "file";
  const isExpanded = !isFile && (expanded.has(node.path) || selectedAncestors.has(node.path));
  const selected = node.entry?.id === selectedFileId;
  const Icon = isFile ? FileText : Folder;

  return (
    <>
      <button
        type="button"
        className="grid h-7 grid-cols-[1rem_1.15rem_minmax(0,1fr)] items-center gap-1 rounded-lg border-0 bg-transparent py-0 pl-[calc(0.5rem+var(--tree-depth,0)*1rem)] pr-2 text-left text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-[var(--shell-tree-hover-bg)] hover:text-foreground data-[selected=true]:bg-[var(--shell-tree-selected-bg)] data-[selected=true]:text-foreground"
        data-selected={selected ? "true" : undefined}
        role="treeitem"
        aria-expanded={isFile ? undefined : isExpanded}
        aria-selected={selected}
        style={{ "--tree-depth": depth } as CSSProperties}
        onClick={() => {
          if (!isFile) {
            onToggle(node.path);
            return;
          }
          if (node.entry) onSelectFile(node.entry);
        }}
      >
        {isFile ? (
          <span className="reference-tree-spacer block h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronRight
            size={14}
            className="text-muted-foreground transition-transform duration-150 ease-in-out data-[expanded=true]:rotate-90"
            data-expanded={isExpanded ? "true" : undefined}
            aria-hidden="true"
          />
        )}
        <Icon size={16} className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      {isExpanded
        ? node.children.map((child) => (
          <WorkspaceTreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            selectedAncestors={selectedAncestors}
            selectedFileId={selectedFileId}
            onToggle={onToggle}
            onSelectFile={onSelectFile}
          />
        ))
        : null}
    </>
  );
}
