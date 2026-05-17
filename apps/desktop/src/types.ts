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
import type { MonacoChemdEditorHandle } from "./features/editor/source-path";
import type {
  CommandMap,
  LocalStoreStatus,
  ManagedPostgresStatus,
  PostgresStatus,
  SidecarStatus,
  WorkspaceFileEntry,
  WorkspaceHandle,
  WorkspaceIngestQueueItem,
  WorkspaceIngestQueueSummary,
} from "./contracts";
import type {
  PostgresProfileCommandError,
  PostgresProfileForm,
  PostgresProfileOperation,
  PostgresProfileRow,
} from "./features/postgres/profiles";
import type { ReactionIntelligenceJobBuildResult } from "./features/reaction-intelligence/job";
import type {
  ReactionIntelligenceJobState,
} from "./features/reaction-intelligence/job-controller";
import type { SemanticPreview } from "./features/preview/semantic-preview";
import type { WorkspaceSymbolIndexSummary } from "./workspace-index/symbol-index";
import type { WorkspaceIndexViewModel } from "./workspace-index/workspace-index";
import type { PostgresRagQueryControllerState } from "./workspace-index/postgres-rag-query-controller";
import type {
  KnowledgeMapViewModel,
  SourceJumpIntent,
} from "./knowledge-map/knowledge-map";
import type { AppSettings, AppSettingsPatch } from "./features/settings/settings";

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
  counts: CommandMap["persist_runtime_graph_rag"]["output"]["counts"];
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
  CommandMap["sync_local_outbox_to_postgres"]["output"]["entries"][number];

export type LocalSyncSummary = {
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  target: CommandMap["sync_local_outbox_to_postgres"]["output"]["target"];
  entries: LocalSyncEntryResult[];
  failedEntries: LocalSyncEntryResult[];
};

export type LocalSyncState = {
  state: PersistOperationState;
  message: string;
  summary: LocalSyncSummary | null;
};

export type LocalSyncResultRowStatus = "synced" | "failed" | "skipped";

export type LocalSyncResultRowCategory = "synced" | "failed" | "retryable" | "skipped";

export type LocalSyncResultRow = {
  rowId: string;
  status: LocalSyncResultRowStatus;
  category: LocalSyncResultRowCategory;
  localId: string;
  graphSnapshotId: string | null;
  idempotencyKey: string;
  message: string;
  error: string | null;
  conflict: boolean;
  retryable: boolean;
  failed: boolean;
  synced: boolean;
  skipped: boolean;
};

// ════════════════════════════════════════════════════════════════════════
// Reaction intelligence types
// ════════════════════════════════════════════════════════════════════════

export type ReactionIntelligenceJobControllerInput = {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  jobBuild: ReactionIntelligenceJobBuildResult;
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
  summary: WorkspaceSymbolIndexSummary | null;
};

// ════════════════════════════════════════════════════════════════════════
// Postgres profile panel types
// ════════════════════════════════════════════════════════════════════════

export type PostgresProfilePanelController = {
  state: CommandMap["list_postgres_profiles"]["output"];
  rows: PostgresProfileRow[];
  currentWorkspaceId: string | null;
  currentWorkspaceProfileId: string | null;
  form: PostgresProfileForm;
  operation: PostgresProfileOperation | null;
  error: PostgresProfileCommandError | null;
  message: string | null;
  onFormChange: (patch: Partial<PostgresProfileForm>) => void;
  onResetForm: () => void;
  onEditProfile: (profileId: string) => void;
  onSaveProfile: () => void;
  onActivateProfile: (profileId: string) => void;
  onBindWorkspaceProfile: (profileId: string) => void;
  onClearWorkspaceProfile: () => void;
  onDeleteProfile: (profileId: string) => void;
  onRefreshProfiles: () => void;
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

export type WorkbenchProps = {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarController: ReturnType<typeof useSidecarController>;
  postgresController: ReturnType<typeof usePostgresController>;
  persistController: ReturnType<typeof usePersistRuntimeController>;
  localStoreController: ReturnType<typeof useLocalStoreController>;
  reactionIntelligenceJobBuild: ReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobController: ReturnType<typeof useReactionIntelligenceJobController>;
  workspaceIngestController: ReturnType<typeof useWorkspaceIngestController>;
  workspaceSymbolIndexController: ReturnType<typeof useWorkspaceSymbolIndexController>;
  semanticPreview: SemanticPreview;
  workspaceIndexViewModel: WorkspaceIndexViewModel;
  workspaceRagQueryState: PostgresRagQueryControllerState;
  workspaceRagQuery: string;
  workspaceRagQueryOperation: RagQueryOperationState;
  workspaceRagQueryMessage: string;
  workspaceRagBackfillOperation: RagQueryOperationState;
  workspaceRagBackfillMessage: string;
  knowledgeMapViewModel: KnowledgeMapViewModel;
  output: ChemdLanguageCompileOutput;
  compileError?: string;
  files: WorkspaceFileEntry[];
  openedTabs: WorkspaceFileEntry[];
  dirtyFileIds: string[];
  selectedFile: WorkspaceFileEntry;
  selectedFileId: string;
  mode: DocumentMode;
  message: string;
  source: string;
  savedSource: string;
  savedAt: string | null;
  workspaceConflict: WorkspaceConflictState | null;
  rootPath: string;
  canSave: boolean;
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
  agentCurrentBeforeHash: string;
  editorRef: RefObject<MonacoChemdEditorHandle | null>;
  settings: AppSettings;
  onSettingsChange: (patch: AppSettingsPatch) => void;
  onResetSettings: () => void;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
  onSelectFile: (file: WorkspaceFileEntry) => void;
  onCloseFileTab: (fileId: string) => void;
  onCloseAllFileTabs: () => void;
  onReorderFileTabs: (orderedFileIds: readonly string[]) => void;
  onOpenNewTab: () => void;
  onSourceChange: (nextSource: string) => void;
  onReloadWorkspaceConflict: () => void;
  onKeepLocalWorkspaceConflict: () => void;
  onKnowledgeMapSourceJump: (intent: SourceJumpIntent) => void;
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
  workspaceIndexViewModel: WorkspaceIndexViewModel;
  workspaceRagQueryState: PostgresRagQueryControllerState;
  workspaceRagQuery: string;
  workspaceRagQueryOperation: RagQueryOperationState;
  workspaceRagQueryMessage: string;
  workspaceRagBackfillOperation: RagQueryOperationState;
  workspaceRagBackfillMessage: string;
  knowledgeMapViewModel: KnowledgeMapViewModel;
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
  reactionIntelligenceJobBuild: ReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobState: ReactionIntelligenceJobState;
  localStoreDisabledReason: string | null;
  localStoreSyncDisabledReason: string | null;
  localStoreError: string | null;
  workspaceIngestState: WorkspaceIngestState;
  workspaceIngestDisabledReason: string | null;
  workspaceSymbolIndexSummary: WorkspaceSymbolIndexSummary | null;
  workspaceSymbolIndexState: PersistOperationState;
  workspaceSymbolIndexMessage: string;
  semanticPreview: SemanticPreview;
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
  onKnowledgeMapSourceJump: (intent: SourceJumpIntent) => void;
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
};
