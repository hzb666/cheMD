import {
  lazy,
  Suspense,
  useState,
  type CSSProperties,
} from "react";
import {
  Eye,
  GitGraph,
  PanelRightClose,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ActivityTool,
  WorkbenchProps,
  InsightPaneProps,
} from "../../types";
import { HtmlPreview } from "../preview/html-preview";
import { SettingsDialog } from "../settings/settings-dialog";
import { buildInsightPaneProps } from "../dock-panels/insight-props";
import { ReferenceBottomPanel, type ReferenceBottomPanelId } from "./bottom-panel";
import { ReferenceDocumentSurface } from "./editor-surface";
import {
  ReferenceActivityRail,
  ReferenceBrandLogo,
  ReferenceGlobalHeaderActions,
  ReferenceTabBar,
} from "./window-chrome";
import { ReferenceExplorer } from "../workspace-sidebar/workspace-sidebar";
import { useReferenceSidebarResize } from "./use-reference-sidebar-resize";

const KnowledgeMapPanel = lazy(() =>
  import("../../knowledge-map/knowledge-map-panel").then((module) => ({
    default: module.KnowledgeMapPanel
  }))
);

// ---------------------------------------------------------------------------
// Workbench -- main workbench shell
// ---------------------------------------------------------------------------

export const Workbench = (props: WorkbenchProps) => {
  const [activeTool, setActiveTool] = useState<ActivityTool>("files");
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [bottomPanel, setBottomPanel] = useState<ReferenceBottomPanelId | null>(null);
  const insightProps = buildInsightPaneProps(activeTool, props);
  const { shellRef, beginResize } = useReferenceSidebarResize(
    sidebarVisible,
    sidebarWidth,
    setSidebarWidth
  );

  const selectActivityTool = (tool: ActivityTool) => {
    if (tool === activeTool) {
      setSidebarVisible((current) => !current);
      return;
    }

    setActiveTool(tool);
    setSidebarVisible(true);
    if (tool === "graph") {
      setPreviewVisible(false);
    }
  };
  const toggleTerminalPanel = () => {
    setBottomPanel((current) => current === "terminal" ? null : "terminal");
  };
  const toggleDiagnosticsPanel = () => {
    setBottomPanel((current) => current === "diagnostics" ? null : "diagnostics");
  };
  const togglePreview = () => {
    setPreviewVisible((current) => !current);
  };

  return (
    <main
      ref={shellRef}
      className="shell-window relative flex h-full min-h-[640px] overflow-hidden border-0 bg-[var(--shell-background)] text-sm text-foreground shadow-none [backdrop-filter:none]"
      style={{ "--reference-sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <ReferenceBrandLogo />
      {sidebarVisible ? (
        <ReferenceGlobalHeaderActions
          bottomPanel={bottomPanel}
          onToggleTerminal={toggleTerminalPanel}
        />
      ) : null}
      <ReferenceActivityRail
        activeTool={activeTool}
        settingsDialog={(
          <SettingsDialog
            mode={props.mode}
            workspaceName={props.workspace.displayName}
            workspaceState={props.workspaceState}
            rootPath={props.rootPath}
            settings={props.settings}
            sidecarStatus={props.sidecarController.status}
            postgresStatus={props.postgresController.status}
            postgresProfiles={props.postgresController.profiles}
            localStoreStatus={props.localStoreController.status}
            onSettingsChange={props.onSettingsChange}
            onResetSettings={props.onResetSettings}
          />
        )}
        onSelectTool={selectActivityTool}
      />
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ReferenceTabBar
          openedTabs={props.openedTabs}
          dirtyFileIds={props.dirtyFileIds}
          selectedFileId={props.selectedFileId}
          sidebarVisible={sidebarVisible}
          bottomPanel={bottomPanel}
          onToggleTerminal={toggleTerminalPanel}
          onSelectFile={props.onSelectFile}
          onCloseFileTab={props.onCloseFileTab}
          onReorderFileTabs={props.onReorderFileTabs}
          onOpenNewTab={props.onOpenNewTab}
        />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ReferenceExplorer
            activeTool={activeTool}
            files={props.files}
            selectedFileId={props.selectedFileId}
            mode={props.mode}
            message={props.message}
            visible={sidebarVisible}
            workspaceName={props.workspace.displayName}
            workspaceState={props.workspaceState}
            insightProps={insightProps}
            onOpenWorkspace={props.onOpenWorkspace}
            onSelectFile={props.onSelectFile}
          />
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
              <ReferenceDocumentSurface
                file={props.selectedFile}
                source={props.source}
                compileOutput={props.output}
                workspaceSymbolIndex={props.workspaceSymbolIndexController.index}
                workspaceConflict={props.workspaceConflict}
                canSave={props.canSave}
                dirty={props.dirtyFileIds.includes(props.selectedFileId)}
                editorRef={props.editorRef}
                settings={props.settings}
                sidebarVisible={sidebarVisible}
                previewVisible={previewVisible}
                bottomPanel={bottomPanel}
                onChange={props.onSourceChange}
                onSave={props.onSave}
                onTogglePreview={togglePreview}
                onToggleDiagnostics={toggleDiagnosticsPanel}
                onReloadWorkspaceConflict={props.onReloadWorkspaceConflict}
                onKeepLocalWorkspaceConflict={props.onKeepLocalWorkspaceConflict}
                onSidebarResize={beginResize}
              />
              {previewVisible ? (
                <ReferencePreviewPane
                  output={props.output}
                  onClose={() => setPreviewVisible(false)}
                />
              ) : null}
              {!previewVisible && activeTool === "graph" ? (
                <ReferenceGraphPane
                  props={insightProps}
                  onClose={() => setActiveTool("files")}
                />
              ) : null}
            </div>
            {bottomPanel ? (
              <ReferenceBottomPanel
                panel={bottomPanel}
                props={insightProps}
                compileOutput={props.output}
                compileError={props.compileError}
                onSelectPanel={setBottomPanel}
                onClose={() => setBottomPanel(null)}
              />
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
};

function ReferencePreviewPane({
  output,
  onClose,
}: {
  output: WorkbenchProps["output"];
  onClose: () => void;
}) {
  return (
    <aside className="flex min-h-0 w-[min(420px,34vw)] shrink-0 flex-col overflow-hidden border-l border-[var(--shell-border)] bg-transparent" aria-label="Chemd HTML preview">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--shell-border-muted)] bg-[var(--shell-panel-header)] px-3">
        <Eye size={14} className="text-muted-foreground" />
        <span className="reference-dock-caption text-xs uppercase tracking-wider text-muted-foreground">Preview</span>
        <strong className="reference-dock-label min-w-0 flex-1 truncate text-sm font-medium">Chemd HTML</strong>
        <Button
          type="button"
          variant="window"
          size="window-icon"
          aria-label="Close preview"
          title="Close preview"
          onClick={onClose}
        >
          <PanelRightClose size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-[var(--shell-preview-host)]">
        <HtmlPreview output={output} />
      </div>
    </aside>
  );
}

function ReferenceGraphPane({
  props,
  onClose,
}: {
  props: InsightPaneProps;
  onClose: () => void;
}) {
  return (
    <aside className="flex min-h-0 w-[clamp(520px,44vw,760px)] shrink-0 flex-col overflow-hidden border-l border-[var(--shell-border)] bg-transparent" aria-label="Knowledge graph workspace">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--shell-border-muted)] bg-[var(--shell-panel-header)] px-3">
        <GitGraph size={14} className="text-muted-foreground" />
        <span className="reference-dock-caption text-xs uppercase tracking-wider text-muted-foreground">Graph</span>
        <strong className="reference-dock-label min-w-0 flex-1 truncate text-sm font-medium">Workspace and Document Graphs</strong>
        <Button
          type="button"
          variant="window"
          size="window-icon"
          aria-label="Close graph workspace"
          title="Close graph workspace"
          onClick={onClose}
        >
          <PanelRightClose size={14} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--shell-graph-body)] p-3">
        <Suspense fallback={<p className="m-0 text-xs leading-relaxed text-muted-foreground">Loading graph workspace...</p>}>
          <KnowledgeMapPanel
            mode="full"
            viewModel={props.knowledgeMapViewModel}
            workspaceIndexViewModel={props.workspaceIndexViewModel}
            onSourceJump={props.onKnowledgeMapSourceJump}
          />
        </Suspense>
      </div>
    </aside>
  );
}
