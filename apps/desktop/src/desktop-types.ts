import type { AgentRun } from "@chemd/agent-tools";
import type {
  ChemdEditorDiagnostic,
  ChemdLanguageCompileOutput,
  ChemdOutlineItem,
  ChemdQuickFixProposal,
  ChemdWorkspaceSymbolIndex,
} from "@chemd/language-service";
import type { RefObject } from "react";
import type { Files } from "lucide-react";
import type { MonacoChemdEditorHandle } from "./MonacoChemdEditor";
import type {
  DesktopCommandMap,
  LocalStoreStatus,
  ManagedPostgresStatus,
  PostgresStatus,
  SidecarStatus,
  WorkspaceFileEntry,
  WorkspaceHandle,
  WorkspaceIngestQueueItem,
  WorkspaceIngestQueueSummary,
} from "./desktop-contracts";
import type {
  PostgresProfileCommandError,
  PostgresProfileForm,
  PostgresProfileOperation,
  PostgresProfileRow,
} from "./desktop-postgres-profiles";
import type { DesktopReactionIntelligenceJobBuildResult } from "./desktop-reaction-intelligence-job";
import type {
  DesktopReactionIntelligenceJobState,
} from "./desktop-reaction-intelligence-job-controller";
import type { DesktopSemanticPreview } from "./desktop-semantic-preview";
import type { DesktopWorkspaceSymbolIndexSummary } from "./desktop-workspace-symbol-index";
import type { DesktopWorkspaceIndexViewModel } from "./workspace-index/desktop-workspace-index";
import type { DesktopPostgresRagQueryControllerState } from "./workspace-index/desktop-postgres-rag-query-controller";
import type {
  DesktopKnowledgeMapViewModel,
  DesktopSourceJumpIntent,
} from "./knowledge-map/desktop-knowledge-map";

// ─── Hook return types ─────────────────────────────────────────────────
import type { useSidecarController } from "./hooks/use-sidecar-controller";
import type {
  usePostgresController,
  usePersistRuntimeController,
} from "./hooks/use-postgres-controller";
import type {
  useLocalStoreController,
  useReactionIntelligenceJobController,
  useWorkspaceIngestController,
  useWorkspaceSymbolIndexController,
} from "./hooks/use-local-store-controller";

// ════════════════════════════════════════════════════════════════════════
// Primitive / union types
// ════════════════════════════════════════════════════════════════════════

export type WorkspaceState = "empty" | "opening" | "open" | "error";

export type DocumentMode = "sample" | "workspace";

export type SidecarOperation = "start" | "stop" | "refresh" | "logs";

export type ManagedPostgresOperation = "init" | "start" | "stop" | "migrate" | "refresh";

export type LocalStoreOperation = "refresh" | "save" | "sync";

export type AgentMessageTone = "info" | "warning" | "success" | "danger";

export type PersistOperationState = "idle" | "pending" | "success" | "failure";

export type RagQueryOperationState = PersistOperationState | "disabled";

export type ActivityTool = "files" | "search" | "graph" | "agent" | "settings";

export type LayoutPanel = "sidebar" | "insight" | "bottom";

export type InsightDockPanelId =
  | "outline"
  | "preview"
  | "rag"
  | "graph"
  | "runtime"
  | "postgres"
  | "storage"
  | "agent"
  | "settings";

export type SidebarPrimaryTab = "files" | "outline" | "problems";

export type SidebarSecondaryTab = "workspace" | "summary";

export type PostgresField = [string, string];

// ════════════════════════════════════════════════════════════════════════
// Message / diagnostic types
// ════════════════════════════════════════════════════════════════════════

export type AgentMessage = { tone: AgentMessageTone; text: string };

export type QuickFixCandidate = {
  diagnostic: ChemdEditorDiagnostic;
  quickFix: ChemdQuickFixProposal;
};

export type AgentOperationResult = { run: AgentRun; message: AgentMessage };

// ════════════════════════════════════════════════════════════════════════
// Workspace / conflict types
// ════════════════════════════════════════════════════════════════════════

export type WorkspaceConflictState = {
  path: string;
  message: string;
  detectedAt: string;
  reloading: boolean;
};

// ════════════════════════════════════════════════════════════════════════
// Persist types
// ════════════════════════════════════════════════════════════════════════

export type PersistSummary = {
  graphSnapshotId: string;
  counts: DesktopCommandMap["persist_runtime_graph_rag"]["output"]["counts"];
};

export type PersistState = {
  state: PersistOperationState;
  message: string;
  summary: PersistSummary | null;
};

export type PersistBuildInput = {
  source: string;
  workspace: WorkspaceHandle;
  file: WorkspaceFileEntry;
  compileOutput: ChemdLanguageCompileOutput;
  agentRun: AgentRun | null;
};

export type PersistControllerInput = PersistBuildInput & {
  mode: DocumentMode;
  postgresStatus: PostgresStatus;
};

export type LocalStoreControllerInput = PersistControllerInput;

// ════════════════════════════════════════════════════════════════════════
// Agent patch types
// ════════════════════════════════════════════════════════════════════════

export type AgentPatchControllerInput = {
  agentRun: AgentRun | null;
  setAgentRun: (run: AgentRun | null) => void;
  setAgentMessage: (message: AgentMessage | null) => void;
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  workspace: WorkspaceHandle;
  source: string;
  onSourceChange: (nextSource: string) => void;
};

// ════════════════════════════════════════════════════════════════════════
// Local snapshot / sync types
// ════════════════════════════════════════════════════════════════════════

export type LocalSnapshotSummary = {
  localId: string;
  idempotencyKey: string;
  pendingCount: number;
};

export type LocalSnapshotState = {
  state: PersistOperationState;
  message: string;
  summary: LocalSnapshotSummary | null;
};

export type LocalSyncEntryResult =
  DesktopCommandMap["sync_local_outbox_to_postgres"]["output"]["entries"][number];

export type LocalSyncSummary = {
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  target: DesktopCommandMap["sync_local_outbox_to_postgres"]["output"]["target"];
  failedEntries: LocalSyncEntryResult[];
};

export type LocalSyncState = {
  state: PersistOperationState;
  message: string;
  summary: LocalSyncSummary | null;
};

// ════════════════════════════════════════════════════════════════════════
// Reaction intelligence types
// ════════════════════════════════════════════════════════════════════════

export type ReactionIntelligenceJobControllerInput = {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  jobBuild: DesktopReactionIntelligenceJobBuildResult;
  onAfterRun: () => void;
};

// ════════════════════════════════════════════════════════════════════════
// Workspace ingest types
// ════════════════════════════════════════════════════════════════════════

export type WorkspaceIngestState = {
  state: PersistOperationState;
  message: string;
  items: WorkspaceIngestQueueItem[];
  summary: WorkspaceIngestQueueSummary | null;
};

export type WorkspaceIngestControllerInput = {
  mode: DocumentMode;
  workspaceState: WorkspaceState;
  workspace: WorkspaceHandle;
  files: WorkspaceFileEntry[];
  onAfterRun?: () => void;
};

// ════════════════════════════════════════════════════════════════════════
// Workspace symbol index types
// ════════════════════════════════════════════════════════════════════════

export type WorkspaceSymbolIndexControllerInput = WorkspaceIngestControllerInput & {
  selectedFile: WorkspaceFileEntry;
  source: string;
};

export type WorkspaceSymbolIndexControllerState = {
  state: PersistOperationState;
  message: string;
  index: ChemdWorkspaceSymbolIndex | null;
  summary: DesktopWorkspaceSymbolIndexSummary | null;
};

// ════════════════════════════════════════════════════════════════════════
// Postgres profile panel types
// ════════════════════════════════════════════════════════════════════════

export type PostgresProfilePanelController = {
  state: DesktopCommandMap["list_postgres_profiles"]["output"];
  rows: PostgresProfileRow[];
  form: PostgresProfileForm;
  operation: PostgresProfileOperation | null;
  error: PostgresProfileCommandError | null;
  message: string | null;
  onFormChange: (patch: Partial<PostgresProfileForm>) => void;
  onResetForm: () => void;
  onEditProfile: (profileId: string) => void;
  onSaveProfile: () => void;
  onActivateProfile: (profileId: string) => void;
  onDeleteProfile: (profileId: string) => void;
  onRefreshProfiles: () => void;
};

// ════════════════════════════════════════════════════════════════════════
// Layout types
// ════════════════════════════════════════════════════════════════════════

export type DockDragPreview = {
  source: InsightDockPanelId;
  target: InsightDockPanelId;
};

export type DesktopLayoutState = {
  sidebarWidth: number;
  insightWidth: number;
  bottomHeight: number;
  sidebarCollapsed: boolean;
  insightCollapsed: boolean;
  bottomCollapsed: boolean;
};

export type InsightDockLayout = {
  order: InsightDockPanelId[];
  sizes: Record<InsightDockPanelId, number>;
  minimized: InsightDockPanelId[];
  active: InsightDockPanelId;
};

// ════════════════════════════════════════════════════════════════════════
// Component prop types
// ════════════════════════════════════════════════════════════════════════

export type SidebarTabItem<T extends string> = {
  id: T;
  label: string;
  icon: typeof Files;
  badge?: string;
};

export type DesktopWorkbenchProps = {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarController: ReturnType<typeof useSidecarController>;
  postgresController: ReturnType<typeof usePostgresController>;
  persistController: ReturnType<typeof usePersistRuntimeController>;
  localStoreController: ReturnType<typeof useLocalStoreController>;
  reactionIntelligenceJobBuild: DesktopReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobController: ReturnType<typeof useReactionIntelligenceJobController>;
  workspaceIngestController: ReturnType<typeof useWorkspaceIngestController>;
  workspaceSymbolIndexController: ReturnType<typeof useWorkspaceSymbolIndexController>;
  semanticPreview: DesktopSemanticPreview;
  workspaceIndexViewModel: DesktopWorkspaceIndexViewModel;
  workspaceRagQueryState: DesktopPostgresRagQueryControllerState;
  workspaceRagQuery: string;
  workspaceRagQueryOperation: RagQueryOperationState;
  workspaceRagQueryMessage: string;
  workspaceRagBackfillOperation: RagQueryOperationState;
  workspaceRagBackfillMessage: string;
  knowledgeMapViewModel: DesktopKnowledgeMapViewModel;
  output: ChemdLanguageCompileOutput;
  compileError?: string;
  files: WorkspaceFileEntry[];
  selectedFile: WorkspaceFileEntry;
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  source: string;
  savedSource: string;
  workspaceConflict: WorkspaceConflictState | null;
  rootPath: string;
  canSave: boolean;
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
  agentCurrentBeforeHash: string;
  editorRef: RefObject<MonacoChemdEditorHandle | null>;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onSourceChange: (nextSource: string) => void;
  onReloadWorkspaceConflict: () => void;
  onKeepLocalWorkspaceConflict: () => void;
  onKnowledgeMapSourceJump: (intent: DesktopSourceJumpIntent) => void;
  onWorkspaceRagQueryChange: (query: string) => void;
  onRunConnectedRagQuery: () => void;
  onBackfillConnectedRagEmbeddings: () => void;
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
};

export type InsightPaneProps = {
  activeTool: ActivityTool;
  outline: ChemdOutlineItem[];
  diagnostics: ChemdEditorDiagnostic[];
  workspaceIndexViewModel: DesktopWorkspaceIndexViewModel;
  workspaceRagQueryState: DesktopPostgresRagQueryControllerState;
  workspaceRagQuery: string;
  workspaceRagQueryOperation: RagQueryOperationState;
  workspaceRagQueryMessage: string;
  workspaceRagBackfillOperation: RagQueryOperationState;
  workspaceRagBackfillMessage: string;
  knowledgeMapViewModel: DesktopKnowledgeMapViewModel;
  mode: DocumentMode;
  sidecarStatus: SidecarStatus;
  sidecarLogTail: string[];
  sidecarOperation: SidecarOperation | null;
  sidecarMessage: string | null;
  sidecarError: string | null;
  postgresStatus: PostgresStatus;
  managedPostgresStatus: ManagedPostgresStatus;
  postgresLoading: boolean;
  managedPostgresOperation: ManagedPostgresOperation | null;
  postgresError: string | null;
  managedPostgresError: string | null;
  managedPostgresMessage: string | null;
  postgresProfiles: PostgresProfilePanelController;
  persistState: PersistState;
  persistDisabledReason: string | null;
  localStoreStatus: LocalStoreStatus;
  localStoreOperation: LocalStoreOperation | null;
  localSnapshotState: LocalSnapshotState;
  localSyncState: LocalSyncState;
  reactionIntelligenceJobBuild: DesktopReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobState: DesktopReactionIntelligenceJobState;
  localStoreDisabledReason: string | null;
  localStoreSyncDisabledReason: string | null;
  localStoreError: string | null;
  workspaceIngestState: WorkspaceIngestState;
  workspaceIngestDisabledReason: string | null;
  workspaceSymbolIndexSummary: DesktopWorkspaceSymbolIndexSummary | null;
  workspaceSymbolIndexState: PersistOperationState;
  workspaceSymbolIndexMessage: string;
  semanticPreview: DesktopSemanticPreview;
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
  agentCurrentBeforeHash: string;
  onStartSidecar: () => void;
  onStopSidecar: () => void;
  onRefreshSidecar: () => void;
  onLoadSidecarLogs: () => void;
  onRefreshPostgres: () => void;
  onInitManagedPostgres: () => void;
  onStartManagedPostgres: () => void;
  onStopManagedPostgres: () => void;
  onMigrateManagedPostgres: () => void;
  onRefreshManagedPostgres: () => void;
  onPersistGraph: () => void;
  onWorkspaceRagQueryChange: (query: string) => void;
  onRunConnectedRagQuery: () => void;
  onBackfillConnectedRagEmbeddings: () => void;
  onRefreshLocalStore: () => void;
  onSaveLocalSnapshot: () => void;
  onSyncLocalOutbox: () => void;
  onRunReactionIntelligenceJob: () => void;
  onRunWorkspaceIngest: () => void;
  onKnowledgeMapSourceJump: (intent: DesktopSourceJumpIntent) => void;
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
};
