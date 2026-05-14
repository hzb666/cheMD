import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { ReactNode } from "react";
import { ChevronRight, GripVertical, PanelRightClose } from "lucide-react";
import type { ChemdOutlineItem } from "@chemd/language-service";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type {
  ActivityTool,
  DesktopWorkbenchProps,
  InsightDockPanelId,
  InsightDockLayout,
  InsightPaneProps,
} from "../desktop-types";
import { insightDockMeta, moveDockPanel } from "../desktop-utils";
import { useDesktopLayout, useInsightDockController } from "../hooks/use-desktop-layout";
import { TopBar, ActivityRail, ResizeHandle, Sidebar } from "./TopBar";
import { EditorPane, BottomPanel } from "./EditorPane";
import { PostgresStatusPanel } from "./PostgresPanel";
import { SidecarControlPanel } from "./SidecarPanel";
import { LocalStorePanel, SemanticPreviewPanel } from "./LocalStorePanel";
import {
  AgentEmptyState,
  AgentQuickFixList,
  SettingsDockPanel,
} from "./AgentPanel";
import { DesktopAgentPanel } from "../agent-panel";
import { buildDesktopAgentTimelinePanel } from "../desktop-agent-timeline-panel";
import { getQuickFixCandidates } from "../desktop-utils";
import { DesktopKnowledgeMapPanel } from "../knowledge-map/DesktopKnowledgeMapPanel";
import { DesktopWorkspaceIndexPanel } from "../workspace-index/DesktopWorkspaceIndexPanel";

// ---------------------------------------------------------------------------
// OutlineTree -- recursive outline tree (extracted from desktop-core.tsx)
// ---------------------------------------------------------------------------

export const OutlineTree = ({ items }: { items: ChemdOutlineItem[] }) => (
  <ul className="flex flex-col gap-0.5 px-2">
    {items.map((item) => (
      <li key={item.id} className="flex flex-col">
        <div className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs hover:bg-muted">
          <ChevronRight size={13} className="text-muted-foreground" />
          <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{item.kind}</span>
          <span className="flex-1 truncate">{item.label}</span>
          <span className="text-[0.65rem] text-muted-foreground">L{item.range.startLine}</span>
        </div>
        {item.children?.length ? <OutlineTree items={item.children} /> : null}
      </li>
    ))}
  </ul>
);

// ---------------------------------------------------------------------------
// InsightDockTabs -- minimized dock panel tab buttons
// ---------------------------------------------------------------------------

export const InsightDockTabs = ({
  panels,
  onActivate,
}: {
  panels: InsightDockPanelId[];
  onActivate: (panel: InsightDockPanelId) => void;
}) => (
  <div className="flex flex-wrap gap-1 px-2 py-1" aria-label="Minimized dock panels">
    {panels.map((panel) => {
      const meta = insightDockMeta[panel];
      const Icon = meta.icon;
      return (
        <button
          key={panel}
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={() => onActivate(panel)}
          title={meta.label}
        >
          <Icon size={13} />
          <span>{meta.label}</span>
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// InsightDockContent -- switches content by panel ID
// ---------------------------------------------------------------------------

export const InsightDockContent = ({
  panel,
  props,
}: {
  panel: InsightDockPanelId;
  props: InsightPaneProps;
}) => {
  const quickFixes = getQuickFixCandidates(props.diagnostics);
  const agentPanel = buildDesktopAgentTimelinePanel(props.agentRun, {
    currentBeforeHash: props.agentCurrentBeforeHash
  });
  const quickFixControls = (
    <>
      {props.agentMessage ? (
        <p className="desktop-agent-message" data-tone={props.agentMessage.tone}>
          {props.agentMessage.text}
        </p>
      ) : null}
      <AgentEmptyState mode={props.mode} hasQuickFixes={quickFixes.length > 0} />
      <AgentQuickFixList
        mode={props.mode}
        quickFixes={quickFixes}
        onProposeQuickFix={props.onProposeQuickFix}
      />
    </>
  );

  const contentByPanel: Record<InsightDockPanelId, ReactNode> = {
    outline: (
      <div className="py-2">
        {props.outline.length > 0 ? (
          <OutlineTree items={props.outline} />
        ) : (
          <p className="px-3 text-xs text-muted-foreground">No outline from language service.</p>
        )}
      </div>
    ),
    preview: (
      <SemanticPreviewPanel
        preview={props.semanticPreview}
        workspaceSymbolIndexState={props.workspaceSymbolIndexState}
        workspaceSymbolIndexMessage={props.workspaceSymbolIndexMessage}
        workspaceSymbolIndexSummary={props.workspaceSymbolIndexSummary}
      />
    ),
    rag: (
      <DesktopWorkspaceIndexPanel
        viewModel={props.workspaceIndexViewModel}
        connectedRagQueryState={props.workspaceRagQueryState}
        query={props.workspaceRagQuery}
        connectedRagOperation={props.workspaceRagQueryOperation}
        connectedRagOperationMessage={props.workspaceRagQueryMessage}
        connectedRagBackfillOperation={props.workspaceRagBackfillOperation}
        connectedRagBackfillMessage={props.workspaceRagBackfillMessage}
        onQueryChange={props.onWorkspaceRagQueryChange}
        onRunConnectedRagQuery={props.onRunConnectedRagQuery}
        onBackfillConnectedRagEmbeddings={props.onBackfillConnectedRagEmbeddings}
      />
    ),
    graph: (
      <DesktopKnowledgeMapPanel
        viewModel={props.knowledgeMapViewModel}
        onSourceJump={props.onKnowledgeMapSourceJump}
      />
    ),
    runtime: (
      <SidecarControlPanel
        status={props.sidecarStatus}
        logTail={props.sidecarLogTail}
        operation={props.sidecarOperation}
        message={props.sidecarMessage}
        errorMessage={props.sidecarError}
        onStart={props.onStartSidecar}
        onStop={props.onStopSidecar}
        onRefresh={props.onRefreshSidecar}
        onLoadLogs={props.onLoadSidecarLogs}
      />
    ),
    postgres: (
      <PostgresStatusPanel
        status={props.postgresStatus}
        managedStatus={props.managedPostgresStatus}
        loading={props.postgresLoading}
        managedOperation={props.managedPostgresOperation}
        errorMessage={props.postgresError}
        managedErrorMessage={props.managedPostgresError}
        managedMessage={props.managedPostgresMessage}
        profiles={props.postgresProfiles}
        persistState={props.persistState}
        persistDisabledReason={props.persistDisabledReason}
        onRefresh={props.onRefreshPostgres}
        onInitManaged={props.onInitManagedPostgres}
        onStartManaged={props.onStartManagedPostgres}
        onStopManaged={props.onStopManagedPostgres}
        onMigrateManaged={props.onMigrateManagedPostgres}
        onRefreshManaged={props.onRefreshManagedPostgres}
        onPersistGraph={props.onPersistGraph}
      />
    ),
    storage: (
      <LocalStorePanel
        status={props.localStoreStatus}
        operation={props.localStoreOperation}
        snapshotState={props.localSnapshotState}
        syncState={props.localSyncState}
        reactionIntelligenceJobBuild={props.reactionIntelligenceJobBuild}
        reactionIntelligenceJobState={props.reactionIntelligenceJobState}
        workspaceIngestState={props.workspaceIngestState}
        disabledReason={props.localStoreDisabledReason}
        syncDisabledReason={props.localStoreSyncDisabledReason}
        workspaceIngestDisabledReason={props.workspaceIngestDisabledReason}
        errorMessage={props.localStoreError}
        onRefresh={props.onRefreshLocalStore}
        onSave={props.onSaveLocalSnapshot}
        onSync={props.onSyncLocalOutbox}
        onRunReactionIntelligenceJob={props.onRunReactionIntelligenceJob}
        onRunWorkspaceIngest={props.onRunWorkspaceIngest}
      />
    ),
    settings: (
      <SettingsDockPanel
        mode={props.mode}
        sidecarStatus={props.sidecarStatus}
        postgresStatus={props.postgresStatus}
        localStoreStatus={props.localStoreStatus}
      />
    ),
    agent: (
      <DesktopAgentPanel
        panel={agentPanel}
        quickFixControls={quickFixControls}
        onApprovePatch={() => props.onApprovePatch()}
        onApplyPatch={() => props.onApplyPatch()}
        onRejectPatch={() => props.onRejectPatch()}
      />
    )
  };

  return <>{contentByPanel[panel]}</>;
};

// ---------------------------------------------------------------------------
// InsightDockFrame -- single dock panel frame with header, body, splitter
// ---------------------------------------------------------------------------

export const InsightDockFrame = ({
  panel,
  layout,
  props,
  onActivate,
  onMinimize,
  onResize,
  onPointerDragStart,
}: {
  panel: InsightDockPanelId;
  layout: InsightDockLayout;
  props: InsightPaneProps;
  onActivate: (panel: InsightDockPanelId) => void;
  onMinimize: (panel: InsightDockPanelId) => void;
  onResize: (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDragStart: (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => void;
}) => {
  const meta = insightDockMeta[panel];
  const Icon = meta.icon;

  return (
    <Card
      data-dock-panel={panel}
      data-active={layout.active === panel}
      size="sm"
      className="relative"
      style={{ "--desktop-dock-panel-height": `${layout.sizes[panel]}px` } as CSSProperties}
    >
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => onActivate(panel)}
        onPointerDown={(event) => onPointerDragStart(panel, event as unknown as ReactPointerEvent<HTMLDivElement>)}
      >
        <div className="flex items-center gap-2">
          <GripVertical size={13} className="text-muted-foreground" />
          <Icon size={14} className="text-muted-foreground" />
          <div className="flex flex-col">
            <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{meta.eyebrow}</span>
            <strong className="text-sm font-medium">{meta.label}</strong>
          </div>
        </div>
        <button
          type="button"
          className="ml-auto inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Minimize ${meta.label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onMinimize(panel);
          }}
        >
          <PanelRightClose size={13} />
        </button>
      </CardHeader>
      <CardContent className="overflow-y-auto" style={{ maxHeight: `calc(var(--desktop-dock-panel-height, 240px) - 3rem)` }}>
        <InsightDockContent panel={panel} props={props} />
      </CardContent>
      <div
        className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize"
        role="separator"
        aria-label={`${meta.label} split resize`}
        aria-orientation="horizontal"
        onPointerDown={(event) => onResize(panel, event as unknown as ReactPointerEvent<HTMLDivElement>)}
      />
    </Card>
  );
};

// ---------------------------------------------------------------------------
// InsightDockPreview -- drag preview placeholder
// ---------------------------------------------------------------------------

export const InsightDockPreview = ({
  panel,
  layout,
}: {
  panel: InsightDockPanelId;
  layout: InsightDockLayout;
}) => {
  const meta = insightDockMeta[panel];
  const Icon = meta.icon;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground opacity-60"
      aria-hidden="true"
      style={{ "--desktop-dock-panel-height": `${layout.sizes[panel]}px` } as CSSProperties}
    >
      <GripVertical size={13} />
      <Icon size={14} />
      <span>{meta.label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// InsightPane -- top-level insight pane
// ---------------------------------------------------------------------------

export const InsightPane = (props: InsightPaneProps) => {
  const dock = useInsightDockController(props.activeTool);
  const orderedPanels = dock.dragPreview
    ? moveDockPanel(dock.visiblePanels, dock.dragPreview.source, dock.dragPreview.target)
    : dock.visiblePanels;

  return (
    <aside className="flex flex-col gap-1 overflow-hidden" aria-label="Docked tools">
      <InsightDockTabs panels={dock.minimizedPanels} onActivate={dock.activatePanel} />
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-1">
        {orderedPanels.map((panel) =>
          dock.dragPreview?.source === panel ? (
            <InsightDockPreview key={`preview-${panel}`} panel={panel} layout={dock.dockLayout} />
          ) : (
            <InsightDockFrame
              key={panel}
              panel={panel}
              layout={dock.dockLayout}
              props={props}
              onActivate={dock.activatePanel}
              onMinimize={dock.minimizePanel}
              onResize={dock.beginDockResize}
              onPointerDragStart={dock.beginDockDrag}
            />
          ),
        )}
      </div>
    </aside>
  );
};

// ---------------------------------------------------------------------------
// DesktopWorkbench -- main workbench shell
// ---------------------------------------------------------------------------

export const DesktopWorkbench = ({
  workspace,
  workspaceState,
  sidecarController,
  postgresController,
  persistController,
  localStoreController,
  reactionIntelligenceJobBuild,
  reactionIntelligenceJobController,
  workspaceIngestController,
  workspaceSymbolIndexController,
  semanticPreview,
  workspaceIndexViewModel,
  workspaceRagQueryState,
  workspaceRagQuery,
  workspaceRagQueryOperation,
  workspaceRagQueryMessage,
  workspaceRagBackfillOperation,
  workspaceRagBackfillMessage,
  knowledgeMapViewModel,
  output,
  compileError,
  files,
  selectedFile,
  selectedFileId,
  mode,
  message,
  source,
  savedSource,
  workspaceConflict,
  rootPath,
  canSave,
  agentRun,
  agentMessage,
  agentCurrentBeforeHash,
  editorRef,
  onRootPathChange,
  onSave,
  onOpenWorkspace,
  onSelectFile,
  onSourceChange,
  onReloadWorkspaceConflict,
  onKeepLocalWorkspaceConflict,
  onKnowledgeMapSourceJump,
  onWorkspaceRagQueryChange,
  onRunConnectedRagQuery,
  onBackfillConnectedRagEmbeddings,
  onProposeQuickFix,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch,
}: DesktopWorkbenchProps) => {
  const [activeTool, setActiveTool] = useState<ActivityTool>("files");
  const layoutController = useDesktopLayout();
  const { layout } = layoutController;

  const selectTool = (tool: ActivityTool) => {
    setActiveTool(tool);
    if (tool === "files") {
      layoutController.expandPanel("sidebar");
      return;
    }
    layoutController.expandPanel("insight");
  };

  return (
    <main className="flex h-full flex-col overflow-hidden bg-background">
      <TopBar
        workspace={workspace}
        workspaceState={workspaceState}
        sidecarStatus={sidecarController.status}
        postgresStatus={postgresController.status}
        diagnosticCount={output.diagnostics.length}
        dirty={source !== savedSource}
        rootPath={rootPath}
        canSave={canSave}
        onRootPathChange={onRootPathChange}
        onSave={onSave}
        onOpenWorkspace={onOpenWorkspace}
      />
      <div
        className="flex flex-1 overflow-hidden"
        style={layoutController.style}
        data-sidebar-collapsed={layout.sidebarCollapsed}
      >
        <ActivityRail activeTool={activeTool} onSelectTool={selectTool} />

        {layout.sidebarCollapsed ? null : (
          <Sidebar
            files={files}
            selectedFileId={selectedFileId}
            mode={mode}
            message={message}
            outline={output.outline}
            diagnostics={output.diagnostics}
            compileStatus={output.status}
            onSelectFile={onSelectFile}
          />
        )}

        <ResizeHandle
          panel="sidebar"
          collapsed={layout.sidebarCollapsed}
          value={layout.sidebarWidth}
          onPointerDown={(event) => layoutController.beginResize("sidebar", event)}
          onKeyDown={(event) => layoutController.handleKeyDown("sidebar", event)}
          onToggle={() => layoutController.togglePanel("sidebar")}
          onReset={() => layoutController.resetPanel("sidebar")}
        />

        <div
          className="grid flex-1 overflow-hidden"
          data-insight-collapsed={layout.insightCollapsed}
          data-bottom-collapsed={layout.bottomCollapsed}
        >
          <EditorPane
            fileName={selectedFile.name}
            mode={mode}
            source={source}
            compileOutput={output}
            workspaceSymbolIndex={workspaceSymbolIndexController.index}
            lineCount={source.split(/\r?\n/).length}
            compiledAt={output.compiledAt}
            workspaceConflict={workspaceConflict}
            editorRef={editorRef}
            onChange={onSourceChange}
            onSave={onSave}
            onReloadWorkspaceConflict={onReloadWorkspaceConflict}
            onKeepLocalWorkspaceConflict={onKeepLocalWorkspaceConflict}
          />

          <ResizeHandle
            panel="insight"
            collapsed={layout.insightCollapsed}
            value={layout.insightWidth}
            onPointerDown={(event) => layoutController.beginResize("insight", event)}
            onKeyDown={(event) => layoutController.handleKeyDown("insight", event)}
            onToggle={() => layoutController.togglePanel("insight")}
            onReset={() => layoutController.resetPanel("insight")}
          />

          {layout.insightCollapsed ? null : (
            <InsightPane
              activeTool={activeTool}
              outline={output.outline}
              diagnostics={output.diagnostics}
              workspaceIndexViewModel={workspaceIndexViewModel}
              workspaceRagQueryState={workspaceRagQueryState}
              workspaceRagQuery={workspaceRagQuery}
              workspaceRagQueryOperation={workspaceRagQueryOperation}
              workspaceRagQueryMessage={workspaceRagQueryMessage}
              workspaceRagBackfillOperation={workspaceRagBackfillOperation}
              workspaceRagBackfillMessage={workspaceRagBackfillMessage}
              knowledgeMapViewModel={knowledgeMapViewModel}
              mode={mode}
              sidecarStatus={sidecarController.status}
              sidecarLogTail={sidecarController.logTail}
              sidecarOperation={sidecarController.operation}
              sidecarMessage={sidecarController.message}
              sidecarError={sidecarController.error}
              postgresStatus={postgresController.status}
              managedPostgresStatus={postgresController.managedStatus}
              postgresLoading={postgresController.loading}
              managedPostgresOperation={postgresController.managedOperation}
              postgresError={postgresController.error}
              managedPostgresError={postgresController.managedError}
              managedPostgresMessage={postgresController.managedMessage}
              postgresProfiles={postgresController.profiles}
              persistState={persistController.state}
              persistDisabledReason={persistController.disabledReason}
              localStoreStatus={localStoreController.status}
              localStoreOperation={localStoreController.operation}
              localSnapshotState={localStoreController.snapshotState}
              localSyncState={localStoreController.syncState}
              reactionIntelligenceJobBuild={reactionIntelligenceJobBuild}
              reactionIntelligenceJobState={reactionIntelligenceJobController.state}
              localStoreDisabledReason={localStoreController.disabledReason}
              localStoreSyncDisabledReason={localStoreController.syncDisabledReason}
              localStoreError={localStoreController.error}
              workspaceIngestState={workspaceIngestController.state}
              workspaceIngestDisabledReason={workspaceIngestController.disabledReason}
              workspaceSymbolIndexSummary={workspaceSymbolIndexController.summary}
              workspaceSymbolIndexState={workspaceSymbolIndexController.state}
              workspaceSymbolIndexMessage={workspaceSymbolIndexController.message}
              semanticPreview={semanticPreview}
              agentRun={agentRun}
              agentMessage={agentMessage}
              agentCurrentBeforeHash={agentCurrentBeforeHash}
              onStartSidecar={sidecarController.start}
              onStopSidecar={sidecarController.stop}
              onRefreshSidecar={sidecarController.refresh}
              onLoadSidecarLogs={sidecarController.loadLogs}
              onRefreshPostgres={postgresController.refresh}
              onInitManagedPostgres={postgresController.initializeManaged}
              onStartManagedPostgres={postgresController.startManaged}
              onStopManagedPostgres={postgresController.stopManaged}
              onMigrateManagedPostgres={postgresController.migrateManaged}
              onRefreshManagedPostgres={postgresController.refreshManaged}
              onPersistGraph={persistController.persist}
              onWorkspaceRagQueryChange={onWorkspaceRagQueryChange}
              onRunConnectedRagQuery={onRunConnectedRagQuery}
              onBackfillConnectedRagEmbeddings={onBackfillConnectedRagEmbeddings}
              onRefreshLocalStore={localStoreController.refresh}
              onSaveLocalSnapshot={localStoreController.saveSnapshot}
              onSyncLocalOutbox={localStoreController.syncPending}
              onRunReactionIntelligenceJob={reactionIntelligenceJobController.run}
              onRunWorkspaceIngest={workspaceIngestController.runIngest}
              onKnowledgeMapSourceJump={onKnowledgeMapSourceJump}
              onProposeQuickFix={onProposeQuickFix}
              onApprovePatch={onApprovePatch}
              onApplyPatch={onApplyPatch}
              onRejectPatch={onRejectPatch}
            />
          )}

          <ResizeHandle
            panel="bottom"
            collapsed={layout.bottomCollapsed}
            value={layout.bottomHeight}
            onPointerDown={(event) => layoutController.beginResize("bottom", event)}
            onKeyDown={(event) => layoutController.handleKeyDown("bottom", event)}
            onToggle={() => layoutController.togglePanel("bottom")}
            onReset={() => layoutController.resetPanel("bottom")}
          />

          {layout.bottomCollapsed ? null : (
            <BottomPanel
              diagnostics={output.diagnostics}
              compileStatus={output.status}
              errorMessage={compileError}
            />
          )}
        </div>
      </div>
    </main>
  );
};
