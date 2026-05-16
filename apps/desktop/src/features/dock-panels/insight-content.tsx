import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { ChemdOutlineItem } from "@chemd/language-service";
import type { InsightDockPanelId, InsightPaneProps } from "../../types";
import { getQuickFixCandidates } from "../../utils";
import { buildAgentTimelinePanel } from "../../agent-panel/timeline-panel";
import { AgentPanel } from "../../agent-panel";
import { WorkspaceIndexPanel } from "../../workspace-index/workspace-index-panel";
import { SidecarControlPanel } from "./sidecar-panel";
import { PostgresStatusPanel } from "./postgres-panel";
import { LocalStorePanel, SemanticPreviewPanel } from "./local-store-panel";
import {
  AgentEmptyState,
  AgentQuickFixList,
  SettingsDockPanel,
} from "./agent-panel";

const emptyCopyClassName = "m-0 text-xs leading-relaxed text-muted-foreground";

const KnowledgeMapPanel = lazy(() =>
  import("../../knowledge-map/knowledge-map-panel").then((module) => ({
    default: module.KnowledgeMapPanel,
  })),
);

export const OutlineTree = ({ items }: { items: ChemdOutlineItem[] }) => (
  <ul className="flex flex-col gap-1 px-2 py-2">
    {items.map((item) => (
      <li key={item.id} className="flex flex-col">
        <div className="reference-dock-text flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs transition-colors hover:bg-white/20">
          <ChevronRight size={13} className="text-muted-foreground" />
          <span className="reference-dock-caption text-xs uppercase tracking-wider text-muted-foreground">{item.kind}</span>
          <span className="flex-1 truncate">{item.label}</span>
          <span className="reference-dock-caption text-xs text-muted-foreground">L{item.range.startLine}</span>
        </div>
        {item.children?.length ? <OutlineTree items={item.children} /> : null}
      </li>
    ))}
  </ul>
);

export const InsightDockContent = ({
  panel,
  props,
}: {
  panel: InsightDockPanelId;
  props: InsightPaneProps;
}) => {
  const quickFixes = getQuickFixCandidates(props.diagnostics);
  const agentPanel = buildAgentTimelinePanel(props.agentRun, {
    currentBeforeHash: props.agentCurrentBeforeHash,
  });
  const quickFixControls = (
    <>
      {props.agentMessage ? (
        <p className="rounded-xl border border-white/35 bg-white/18 p-3 text-sm data-[tone=danger]:text-destructive data-[tone=info]:text-primary" data-tone={props.agentMessage.tone}>
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
          <p className="reference-dock-text px-3 text-xs text-muted-foreground">No outline from language service.</p>
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
      <WorkspaceIndexPanel
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
      <Suspense fallback={<p className={emptyCopyClassName}>Loading reaction graph...</p>}>
        <KnowledgeMapPanel
          mode="compact"
          viewModel={props.knowledgeMapViewModel}
          workspaceIndexViewModel={props.workspaceIndexViewModel}
          onSourceJump={props.onKnowledgeMapSourceJump}
        />
      </Suspense>
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
      <AgentPanel
        panel={agentPanel}
        quickFixControls={quickFixControls}
        onApprovePatch={() => props.onApprovePatch()}
        onApplyPatch={() => props.onApplyPatch()}
        onRejectPatch={() => props.onRejectPatch()}
      />
    ),
  };

  return <>{contentByPanel[panel]}</>;
};
