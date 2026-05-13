import { invoke } from "@tauri-apps/api/core";
import { Activity, AlertTriangle, Bot, CheckCircle2, ChevronRight, CircleDot, Database, FileCode2, Files, FlaskConical, GitGraph, GripHorizontal, GripVertical, HardDrive, Lightbulb, PanelBottom, PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, PlayCircle, RefreshCw, ScrollText, Search, Settings, ShieldCheck, Sparkles, Square, UploadCloud, Wrench, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ChangeEvent as ReactChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";

import { appendToolCall, applyPatchDecision, approvePatchDecision, attachEvidence, createAgentRun, createToolResult, getAuditTimeline, proposePatch, rejectPatchDecision, transitionAgentRunStatus, type AgentAuditEvent, type AgentEvidence, type AgentRun, type AgentToolCall, type PatchDecision, type PatchProposal } from "@chemd/agent-tools";
import { buildEditorGraphRagRecords, compileChemdForEditor, type ChemdEditorDiagnostic, type ChemdLanguageCompileOutput, type ChemdOutlineItem, type ChemdQuickFixProposal, type ChemdTextEdit, type ChemdWorkspaceSymbolIndex } from "@chemd/language-service";

import { shellFiles, shellPostgresStatus, shellSidecarStatus, shellWorkspace, type CreateEmbeddingVectorResult, type DesktopCommandError, type DesktopCommandMap, type EmbeddingProviderStatus, type LocalStoreStatus, type ManagedPostgresStatus, type PostgresRagQueryResult, type PostgresStatus, type RuntimeState, type SidecarStatus, type WorkspaceFileEntry, type WorkspaceHandle, type WorkspaceIngestQueueItem, type WorkspaceIngestQueueSummary } from "./desktop-contracts";
import { buildLocalRuntimeSnapshotInput } from "./desktop-local-store";
import {
  buildPostgresProfileRows,
  buildPostgresProfileSaveInput,
  clearPostgresProfilePassword,
  createInitialPostgresProfileForm,
  createPostgresProfileFormFromProfile,
  initialPostgresProfilesState,
  toPostgresProfileCommandError,
  toPostgresProfileValidationError,
  type PostgresProfileCommandError,
  type PostgresProfileForm,
  type PostgresProfileOperation,
  type PostgresProfileRow
} from "./desktop-postgres-profiles";
import {
  buildExternalPostgresReadiness,
  buildManagedPostgresReadiness,
  formatPostgresDisplayValue,
  type PostgresReadinessItem
} from "./desktop-postgres-status";
import { buildDesktopReactionIntelligenceJob, type DesktopReactionIntelligenceJobBuildResult } from "./desktop-reaction-intelligence-job";
import {
  createDesktopReactionIntelligenceJobController,
  toDesktopReactionIntelligenceWorkerResult,
  type DesktopReactionIntelligenceJobController,
  type DesktopReactionIntelligenceJobState
} from "./desktop-reaction-intelligence-job-controller";
import {
  initialLocalReactionIntelligenceArtifactState,
  readLatestLocalReactionIntelligenceArtifact,
  reactionIntelligenceArtifactHasReactionOverlap,
  type LocalReactionIntelligenceArtifactState
} from "./desktop-reaction-intelligence-artifact-controller";
import { buildPersistRuntimeGraphRagCommandInput } from "./desktop-runtime-persistence";
import { buildDesktopSemanticPreview, type DesktopSemanticPreview } from "./desktop-semantic-preview";
import { buildDesktopWorkspaceSymbolIndex, type DesktopWorkspaceSymbolIndexSummary } from "./desktop-workspace-symbol-index";
import { runWorkspaceIngestOutboxSave } from "./desktop-workspace-ingest-runner";
import { DesktopKnowledgeMapPanel } from "./knowledge-map/DesktopKnowledgeMapPanel";
import { buildDesktopKnowledgeMapViewModel, type DesktopKnowledgeMapViewModel, type DesktopSourceJumpIntent } from "./knowledge-map/desktop-knowledge-map";
import { isSameChemdDesktopDocumentPath, MonacoChemdEditor, toChemdDesktopModelUri, type MonacoChemdEditorHandle } from "./MonacoChemdEditor";
import { DesktopWorkspaceIndexPanel } from "./workspace-index/DesktopWorkspaceIndexPanel";
import {
  buildDesktopPostgresRagQueryControllerState,
  type DesktopPostgresRagQueryControllerState
} from "./workspace-index/desktop-postgres-rag-query-controller";
import type { DesktopWorkspaceIndexViewModel } from "./workspace-index/desktop-workspace-index";
import { useDesktopWorkspaceIndexController } from "./workspace-index/use-desktop-workspace-index";

type WorkspaceState = "empty" | "opening" | "open" | "error"; type DocumentMode = "sample" | "workspace";
type SidecarOperation = "start" | "stop" | "refresh" | "logs";
type ManagedPostgresOperation = "init" | "start" | "stop" | "migrate" | "refresh";
type LocalStoreOperation = "refresh" | "save" | "sync";
type RagQueryOperationState = PersistOperationState | "disabled";
type AgentMessageTone = "info" | "warning" | "success" | "danger";
type AgentMessage = { tone: AgentMessageTone; text: string };
type QuickFixCandidate = { diagnostic: ChemdEditorDiagnostic; quickFix: ChemdQuickFixProposal };
type AgentOperationResult = { run: AgentRun; message: AgentMessage };
type PersistOperationState = "idle" | "pending" | "success" | "failure";
type WorkspaceConflictState = {
  path: string;
  message: string;
  detectedAt: string;
  reloading: boolean;
};
type PersistSummary = {
  graphSnapshotId: string;
  counts: DesktopCommandMap["persist_runtime_graph_rag"]["output"]["counts"];
};
type PersistState = {
  state: PersistOperationState;
  message: string;
  summary: PersistSummary | null;
};
type PersistBuildInput = {
  source: string;
  workspace: WorkspaceHandle;
  file: WorkspaceFileEntry;
  compileOutput: ChemdLanguageCompileOutput;
  agentRun: AgentRun | null;
};
type PersistControllerInput = PersistBuildInput & {
  mode: DocumentMode;
  postgresStatus: PostgresStatus;
};
type LocalStoreControllerInput = PersistBuildInput & {
  mode: DocumentMode;
  postgresStatus: PostgresStatus;
};
type AgentPatchControllerInput = {
  agentRun: AgentRun | null;
  setAgentRun: (run: AgentRun | null) => void;
  setAgentMessage: (message: AgentMessage | null) => void;
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  workspace: WorkspaceHandle;
  source: string;
  onSourceChange: (nextSource: string) => void;
};
type LocalSnapshotSummary = {
  localId: string;
  idempotencyKey: string;
  pendingCount: number;
};
type LocalSnapshotState = {
  state: PersistOperationState;
  message: string;
  summary: LocalSnapshotSummary | null;
};
type LocalSyncEntryResult = DesktopCommandMap["sync_local_outbox_to_postgres"]["output"]["entries"][number];
type LocalSyncSummary = {
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  target: DesktopCommandMap["sync_local_outbox_to_postgres"]["output"]["target"];
  failedEntries: LocalSyncEntryResult[];
};
type LocalSyncState = {
  state: PersistOperationState;
  message: string;
  summary: LocalSyncSummary | null;
};
type ReactionIntelligenceJobControllerInput = {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  jobBuild: DesktopReactionIntelligenceJobBuildResult;
  onAfterRun: () => void;
};
type WorkspaceIngestState = {
  state: PersistOperationState;
  message: string;
  items: WorkspaceIngestQueueItem[];
  summary: WorkspaceIngestQueueSummary | null;
};
type WorkspaceIngestControllerInput = {
  mode: DocumentMode;
  workspaceState: WorkspaceState;
  workspace: WorkspaceHandle;
  files: WorkspaceFileEntry[];
  onAfterRun?: () => void;
};
type WorkspaceSymbolIndexControllerInput = WorkspaceIngestControllerInput & {
  selectedFile: WorkspaceFileEntry;
  source: string;
};
type WorkspaceSymbolIndexControllerState = {
  state: PersistOperationState;
  message: string;
  index: ChemdWorkspaceSymbolIndex | null;
  summary: DesktopWorkspaceSymbolIndexSummary | null;
};
type PostgresField = [string, string];
type PostgresProfilePanelController = {
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
type ActivityTool = "files" | "search" | "graph" | "agent" | "settings";
type LayoutPanel = "sidebar" | "insight" | "bottom";
type InsightDockPanelId = "outline" | "preview" | "rag" | "graph" | "runtime" | "postgres" | "storage" | "agent" | "settings";
type SidebarPrimaryTab = "files" | "outline" | "problems";
type SidebarSecondaryTab = "workspace" | "summary";
type DockDragPreview = {
  source: InsightDockPanelId;
  target: InsightDockPanelId;
};
type DesktopLayoutState = {
  sidebarWidth: number;
  insightWidth: number;
  bottomHeight: number;
  sidebarCollapsed: boolean;
  insightCollapsed: boolean;
  bottomCollapsed: boolean;
};
type InsightDockLayout = {
  order: InsightDockPanelId[];
  sizes: Record<InsightDockPanelId, number>;
  minimized: InsightDockPanelId[];
  active: InsightDockPanelId;
};
type DesktopWorkbenchProps = {
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
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
};
type InsightPaneProps = {
  activeTool: ActivityTool;
  outline: ChemdOutlineItem[];
  diagnostics: ChemdEditorDiagnostic[];
  workspaceIndexViewModel: DesktopWorkspaceIndexViewModel;
  workspaceRagQueryState: DesktopPostgresRagQueryControllerState;
  workspaceRagQuery: string;
  workspaceRagQueryOperation: RagQueryOperationState;
  workspaceRagQueryMessage: string;
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

const sampleSources: Record<string, string> = {
  "suzuki-screen.chemd.md": "---\nid: exp-desktop-suzuki\ntitle: Suzuki coupling condition screen\ndate: 2026-05-12\n---\n\n:::chemd #mol-aryl-bromide\nsmiles: Cc1ccc(Br)cc1\n:::\n\n:::chemd #mol-boronic-acid\nsmiles: OB(O)c1ccccc1\n:::\n\n:::chemd #mol-biaryl-product\nsmiles: Cc1ccc(-c2ccccc2)cc1\n:::\n\n:::chemd #rxn-screen\nkind: reaction\nreactants: @mol-aryl-bromide | @mol-boronic-acid\nproducts: @mol-biaryl-product\nconditions:\n  catalyst: Pd(PPh3)4\n  base: K2CO3\n  solvent: dioxane/water\n:::\n\n:::result #screen-result\nstatus: pending\nyield: 78%\n:::\n",
  "calibration.chemd.md": "---\nid: exp-desktop-calibration\ntitle: HPLC calibration record\ndate: 2026-05-12\n---\n\n:::sample #std-a\nname: caffeine standard\namount: 2.0 mg\n:::\n\n:::analysis #calibration\nmethod: HPLC-UV\ntarget: caffeine\nresult: linear fit accepted\n:::\n"
};

const activityItems: { id: ActivityTool; label: string; icon: typeof Files }[] = [
  { id: "files", label: "Files", icon: Files },
  { id: "search", label: "RAG Search", icon: Search },
  { id: "graph", label: "Reaction Graph", icon: GitGraph },
  { id: "agent", label: "Agent Runs", icon: Bot },
  { id: "settings", label: "Settings", icon: Settings }
];

const layoutBounds: Record<LayoutPanel, { defaultValue: number; min: number; max: number; step: number }> = {
  sidebar: { defaultValue: 272, min: 208, max: 420, step: 16 },
  insight: { defaultValue: 376, min: 320, max: 640, step: 16 },
  bottom: { defaultValue: 176, min: 104, max: 420, step: 16 }
};
type SidebarTabItem<T extends string> = {
  id: T;
  label: string;
  icon: typeof Files;
  badge?: string;
};

const initialDesktopLayout: DesktopLayoutState = {
  sidebarWidth: layoutBounds.sidebar.defaultValue,
  insightWidth: layoutBounds.insight.defaultValue,
  bottomHeight: layoutBounds.bottom.defaultValue,
  sidebarCollapsed: false,
  insightCollapsed: false,
  bottomCollapsed: false
};

const insightDockPanels: {
  id: InsightDockPanelId;
  label: string;
  eyebrow: string;
  icon: typeof Files;
}[] = [
  { id: "outline", label: "Outline", eyebrow: "Inspect", icon: Files },
  { id: "preview", label: "Semantic Preview", eyebrow: "Preview", icon: FileCode2 },
  { id: "rag", label: "RAG Search", eyebrow: "Search", icon: Search },
  { id: "graph", label: "Reaction Graph", eyebrow: "Graph", icon: GitGraph },
  { id: "runtime", label: "chem-service", eyebrow: "Runtime", icon: HardDrive },
  { id: "postgres", label: "Postgres", eyebrow: "Storage", icon: Database },
  { id: "storage", label: "Local Store", eyebrow: "Offline", icon: HardDrive },
  { id: "agent", label: "Agent Runs", eyebrow: "Agent", icon: Bot },
  { id: "settings", label: "Settings", eyebrow: "Config", icon: Settings }
];

const insightDockMeta = Object.fromEntries(
  insightDockPanels.map((panel) => [panel.id, panel])
) as Record<InsightDockPanelId, (typeof insightDockPanels)[number]>;

const initialInsightDockLayout: InsightDockLayout = {
  order: ["outline", "preview", "rag", "graph", "runtime", "postgres", "storage", "agent", "settings"],
  sizes: {
    outline: 190,
    preview: 320,
    rag: 220,
    graph: 220,
    runtime: 260,
    postgres: 380,
    storage: 300,
    agent: 360,
    settings: 220
  },
  minimized: ["rag", "graph", "settings"],
  active: "outline"
};

const activityDockPanel: Record<ActivityTool, InsightDockPanelId> = {
  files: "outline",
  search: "rag",
  graph: "graph",
  agent: "agent",
  settings: "settings"
};

const clampLayoutSize = (panel: LayoutPanel, value: number): number => {
  const { min, max } = layoutBounds[panel];
  return Math.min(max, Math.max(min, value));
};

const getLayoutSize = (layout: DesktopLayoutState, panel: LayoutPanel): number => {
  if (panel === "sidebar") return layout.sidebarWidth;
  if (panel === "insight") return layout.insightWidth;
  return layout.bottomHeight;
};

const setLayoutSize = (
  layout: DesktopLayoutState,
  panel: LayoutPanel,
  value: number
): DesktopLayoutState => {
  const nextSize = clampLayoutSize(panel, value);
  if (panel === "sidebar") return { ...layout, sidebarWidth: nextSize, sidebarCollapsed: false };
  if (panel === "insight") return { ...layout, insightWidth: nextSize, insightCollapsed: false };
  return { ...layout, bottomHeight: nextSize, bottomCollapsed: false };
};

const toggleLayoutPanel = (layout: DesktopLayoutState, panel: LayoutPanel): DesktopLayoutState => {
  if (panel === "sidebar") return { ...layout, sidebarCollapsed: !layout.sidebarCollapsed };
  if (panel === "insight") return { ...layout, insightCollapsed: !layout.insightCollapsed };
  return { ...layout, bottomCollapsed: !layout.bottomCollapsed };
};

const isLayoutPanelCollapsed = (layout: DesktopLayoutState, panel: LayoutPanel): boolean => {
  if (panel === "sidebar") return layout.sidebarCollapsed;
  if (panel === "insight") return layout.insightCollapsed;
  return layout.bottomCollapsed;
};

const getResizeDelta = (panel: LayoutPanel, startX: number, startY: number, event: PointerEvent): number => {
  if (panel === "sidebar") return event.clientX - startX;
  if (panel === "insight") return startX - event.clientX;
  return startY - event.clientY;
};

const getKeyboardResizeDelta = (panel: LayoutPanel, key: string): number => {
  const step = layoutBounds[panel].step;
  if (panel === "bottom") {
    if (key === "ArrowUp") return step;
    if (key === "ArrowDown") return -step;
    return 0;
  }
  if (panel === "insight") {
    if (key === "ArrowLeft") return step;
    if (key === "ArrowRight") return -step;
    return 0;
  }
  if (key === "ArrowRight") return step;
  if (key === "ArrowLeft") return -step;
  return 0;
};

const clampDockPanelSize = (value: number): number => Math.min(560, Math.max(96, value));

const moveDockPanel = (
  order: InsightDockPanelId[],
  source: InsightDockPanelId,
  target: InsightDockPanelId
): InsightDockPanelId[] => {
  if (source === target) return order;
  const sourceIndex = order.indexOf(source);
  const targetIndex = order.indexOf(target);
  if (sourceIndex === -1 || targetIndex === -1) return order;
  const nextOrder = order.filter((item) => item !== source);
  // The original target index naturally inserts after the target when dragging down.
  nextOrder.splice(targetIndex, 0, source);
  return nextOrder;
};

const statusToneByState: Record<RuntimeState, string> = { ready: "success", placeholder: "pending", degraded: "warning", offline: "danger" };
const workspaceStateLabel: Record<WorkspaceState, string> = { empty: "Empty", opening: "Opening", open: "Open", error: "Fallback" };
const initialManagedPostgresStatus: ManagedPostgresStatus = {
  state: "placeholder",
  label: "Managed Postgres unchecked",
  detail: "Refresh managed Postgres status to inspect bundled binaries and local configuration.",
  available: false,
  reason: "Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries",
  configured: false,
  source: null,
  dataDir: null,
  host: null,
  port: null,
  database: null,
  user: null,
  pid: null,
  startedAt: null,
  migrationState: "not_initialized"
};
const initialLocalStoreStatus: LocalStoreStatus = {
  state: "placeholder",
  label: "Local Store unchecked",
  detail: "Refresh the offline JSON outbox status before saving local snapshots.",
  available: false,
  storagePath: null,
  outboxPendingCount: 0,
  outboxFailedCount: 0,
  lastSavedAt: null,
  lastSyncedAt: null
};
const initialEmbeddingProviderStatus: EmbeddingProviderStatus = {
  state: "offline",
  configured: false,
  providerKind: "http_env",
  model: null,
  embeddingDim: null,
  distanceMetric: null,
  baseUrlHost: null,
  timeoutMs: null,
  apiKeyConfigured: false,
  detail: "Embedding provider status has not been refreshed."
};
const agentStatusLabel: Record<AgentRun["status"], string> = {
  created: "Created",
  running: "Running",
  waiting_for_approval: "Awaiting approval",
  applying_patch: "Applying patch",
  validating: "Validating",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  canceled: "Canceled"
};
const auditEventLabel: Record<AgentAuditEvent["type"], string> = {
  run_created: "Run",
  status_transitioned: "Status",
  tool_call_appended: "Tool",
  evidence_attached: "Evidence",
  patch_proposed: "Patch",
  patch_approved: "Approve",
  patch_rejected: "Reject",
  patch_applied: "Apply",
  decision_blocked: "Blocked"
};

const invokeDesktop = async <Command extends keyof DesktopCommandMap>(
  command: Command,
  input: DesktopCommandMap[Command]["input"]
): Promise<DesktopCommandMap[Command]["output"]> =>
  input === undefined ? invoke(command) : invoke(command, input as Record<string, unknown>);

const getSampleSource = (file: WorkspaceFileEntry): string =>
  sampleSources[file.name] ?? sampleSources["suzuki-screen.chemd.md"];

const redactSensitiveRuntimeText = (message: string): string =>
  message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .replace(/(\/\/[^:\s/]+:)[^@\s/]+(@)/g, "$1[redacted]$2")
    .replace(/\b(?:database_url|password|passwd|pwd)=\S+/gi, (match) => {
      const [key] = match.split("=", 1);
      return `${key}=[redacted]`;
    });

const getCommandErrorMessage = (error: unknown, fallback: string): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = redactSensitiveRuntimeText(message.split(/\r?\n/, 1)[0].trim());
  if (!firstLine) return fallback;
  return firstLine.length <= 140 ? firstLine : `${firstLine.slice(0, 137)}...`;
};

const getCommandErrorCode = (error: unknown): string | null => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  return typeof commandError?.code === "string" ? commandError.code : null;
};

const getDisplayableError = (error: unknown): string => {
  return getCommandErrorMessage(error, "Unknown desktop command failure");
};

const getSidecarErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return firstLine || "chem-service command failed";
};

const getPostgresErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Postgres status unavailable");
};

const formatPostgresValue = formatPostgresDisplayValue;

const getPostgresBadgeDetail = (status: PostgresStatus): string => {
  if (!status.configured) return "Postgres is not configured";
  return [
    status.source ? `source ${status.source}` : null,
    status.host ? `host ${status.host}` : null,
    status.database ? `database ${status.database}` : null,
    status.user ? `user ${status.user}` : null
  ].filter(Boolean).join(" / ") || "Postgres is configured; inspect the runtime panel for details";
};

const isManagedPostgresSource = (source: string | null): boolean =>
  source?.startsWith("managed postgres:") ?? false;

const getActivePostgresTarget = (
  status: PostgresStatus,
  managedStatus: ManagedPostgresStatus
): "External" | "Managed" | "None" => {
  if (status.configured && !isManagedPostgresSource(status.source)) return "External";
  if (status.configured && isManagedPostgresSource(status.source)) return "Managed";
  return managedStatus.configured ? "Managed" : "None";
};

const getPostgresTargetMessage = (
  status: PostgresStatus,
  managedStatus: ManagedPostgresStatus
): string => {
  const target = getActivePostgresTarget(status, managedStatus);
  if (target === "External") {
    return managedStatus.configured
      ? "External Postgres has priority; Managed Postgres remains available as a local fallback."
      : "External Postgres is selected from the current runtime configuration.";
  }
  if (target === "Managed") {
    if (!status.configured) {
      return "Managed Postgres is configured locally; start it and refresh runtime readiness.";
    }
    return "No external Postgres source is selected; the runtime is using Managed Postgres configuration.";
  }
  return "No Postgres target is configured. Initialize Managed Postgres or set an external Postgres URL.";
};

const getManagedPostgresUnavailableMessage = (status: ManagedPostgresStatus): string | null => {
  if (status.available) return null;
  const reason = status.reason ?? status.detail;
  return reason.includes("CHEMD_MANAGED_POSTGRES_BIN_DIR")
    ? reason
    : `${reason}. Set CHEMD_MANAGED_POSTGRES_BIN_DIR or bundle PostgreSQL binaries.`;
};

const getExternalConfigured = (status: PostgresStatus): boolean =>
  status.configured && !isManagedPostgresSource(status.source);

const getExternalPostgresFields = (status: PostgresStatus): PostgresField[] => {
  if (!getExternalConfigured(status)) {
    return [
      ["State", "placeholder"],
      ["Configured", "no"],
      ["Source", "not selected"],
      ["Host", "unknown"],
      ["Database", "unknown"],
      ["User", "unknown"],
      ["SSL", "not configured"],
      ["pgvector", "unknown"],
      ["Schema", "unknown"],
      ["Timeout", "not configured"],
      ["Detail", "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL to select External Postgres."]
    ];
  }
  return [
    ["State", status.state],
    ["Configured", "yes"],
    ["Source", formatPostgresValue(status.source)],
    ["Host", formatPostgresValue(status.host)],
    ["Database", formatPostgresValue(status.database)],
    ["User", formatPostgresValue(status.user)],
    ["SSL", status.ssl],
    ["pgvector", formatPostgresValue(status.vectorInstalled)],
    ["Schema", formatPostgresValue(status.schemaReady)],
    ["Timeout", `${status.timeoutMs}ms`],
    ["Detail", status.detail]
  ];
};

const getManagedPostgresFields = (status: ManagedPostgresStatus): PostgresField[] => [
  ["Available", formatPostgresValue(status.available)],
  ["Configured", formatPostgresValue(status.configured)],
  ["Data dir", formatPostgresValue(status.dataDir)],
  ["Host", formatPostgresValue(status.host)],
  ["Port", formatPostgresValue(status.port)],
  ["Database", formatPostgresValue(status.database)],
  ["User", formatPostgresValue(status.user)],
  ["PID", formatPostgresValue(status.pid)],
  ["Migration", status.migrationState],
  ["Detail", status.detail]
];

const getLocalStoreFields = (status: LocalStoreStatus): PostgresField[] => [
  ["Available", formatPostgresValue(status.available)],
  ["Pending", formatPostgresValue(status.outboxPendingCount)],
  ["Failed", formatPostgresValue(status.outboxFailedCount)],
  ["Last saved", formatLocalTimestamp(status.lastSavedAt)],
  ["Last synced", formatLocalTimestamp(status.lastSyncedAt)],
  ["Storage path", formatPostgresValue(status.storagePath)]
];

const getManagedPostgresControlState = (
  status: ManagedPostgresStatus,
  loading: boolean,
  operation: ManagedPostgresOperation | null
) => {
  const busy = loading || operation !== null;
  return {
    canInit: !busy && status.available && !status.configured,
    canStart: !busy && status.available && status.configured && status.pid === null,
    canStop: !busy && status.available && status.pid !== null,
    canMigrate: !busy && status.available && status.configured && status.pid !== null,
    canRefresh: !busy
  };
};

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

const applyTextEdits = (source: string, edits: readonly ChemdTextEdit[]): string =>
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

const createEditorSourceHash = (source: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
};

const initialPersistState: PersistState = {
  state: "idle",
  message: "Graph/RAG payload is ready for a configured Postgres runtime.",
  summary: null
};
const initialLocalSnapshotState: LocalSnapshotState = {
  state: "idle",
  message: "Local Store is an offline cache/outbox. It does not mean Postgres sync has succeeded.",
  summary: null
};
const initialLocalSyncState: LocalSyncState = {
  state: "idle",
  message: "Sync Pending shares only pending outbox entries after Postgres readiness checks pass.",
  summary: null
};
const initialWorkspaceIngestState: WorkspaceIngestState = {
  state: "idle",
  message: "Scan/Ingest reads workspace files and saves eligible Graph/RAG snapshots to the Local Store outbox.",
  items: [],
  summary: null
};
const initialWorkspaceSymbolIndexState: WorkspaceSymbolIndexControllerState = {
  state: "idle",
  message: "Open a local workspace to build cross-document reference suggestions.",
  index: null,
  summary: null
};

const getPersistErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Persist graph failed");
};

const getLocalStoreErrorMessage = (error: unknown): string => {
  const commandError = error as Partial<DesktopCommandError> | undefined;
  const message = commandError?.message ?? (error instanceof Error ? error.message : String(error));
  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return redactSensitiveRuntimeText(firstLine || "Local Store command failed");
};

const getLocalOutboxErrorText = (error: string | undefined): string => {
  const safeError = redactSensitiveRuntimeText((error ?? "No entry error reported").split(/\r?\n/, 1)[0].trim());
  return safeError.length <= 120 ? safeError : `${safeError.slice(0, 117)}...`;
};

const summarizeGraphSnapshotId = (graphSnapshotId: string): string =>
  graphSnapshotId.length <= 38
    ? graphSnapshotId
    : `${graphSnapshotId.slice(0, 16)}...${graphSnapshotId.slice(-16)}`;

const formatPersistCounts = (counts: PersistSummary["counts"]): string =>
  `${counts.snapshots} snapshot / ${counts.nodes} nodes / ${counts.edges} edges / ${counts.citations} citations / ${counts.agentRuns} agent runs / ${counts.agentToolCalls} tools / ${counts.patchProposals} patches`;

const summarizeLocalId = (value: string): string =>
  value.length <= 34 ? value : `${value.slice(0, 14)}...${value.slice(-14)}`;

const formatLocalSyncCounts = (summary: LocalSyncSummary): string =>
  `${summary.syncedCount} synced / ${summary.failedCount} failed / ${summary.skippedCount} skipped`;

const formatWorkspaceIngestCounts = (summary: WorkspaceIngestQueueSummary): string =>
  `${summary.totalCount} total / ${summary.pendingCount} pending / ${summary.skippedCount} skipped / ${summary.failedCount} failed / ${summary.retryableCount} retryable`;

const formatLocalTimestamp = (value: string | null): string => {
  if (!value) return "never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getPersistDisabledReason = ({
  mode,
  file,
  postgresStatus,
  compileStatus
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  postgresStatus: PostgresStatus;
  compileStatus: ChemdLanguageCompileOutput["status"];
}): string | null => {
  if (mode !== "workspace") return "Open a local workspace file before persisting Graph/RAG records.";
  if (file.kind !== "file") return "Select a file before persisting Graph/RAG records.";
  if (!postgresStatus.configured) return "Configure Postgres before persisting Graph/RAG records.";
  if (postgresStatus.state !== "ready") return "Postgres must be reachable before persisting Graph/RAG records.";
  if (postgresStatus.vectorInstalled !== true) return "Install pgvector before persisting Graph/RAG records.";
  if (postgresStatus.schemaReady !== true) return "Run PostgreSQL migrations before persisting Graph/RAG records.";
  if (compileStatus === "failed") return "Resolve the compile failure before persisting Graph/RAG records.";
  return null;
};

const getLocalSnapshotDisabledReason = ({
  mode,
  file,
  compileStatus
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  compileStatus: ChemdLanguageCompileOutput["status"];
}): string | null => {
  if (mode !== "workspace") return "Open a local workspace file before saving an offline snapshot.";
  if (file.kind !== "file") return "Select a file before saving an offline snapshot.";
  if (compileStatus === "failed") return "Resolve the compile failure before saving an offline snapshot.";
  return null;
};

const getLocalSyncDisabledReason = ({
  localStoreStatus,
  postgresStatus
}: {
  localStoreStatus: LocalStoreStatus;
  postgresStatus: PostgresStatus;
}): string | null => {
  if (!localStoreStatus.available) return "Local Store must be available before syncing pending outbox entries.";
  if (localStoreStatus.outboxPendingCount <= 0) return "No pending Local Store entries to sync.";
  if (!postgresStatus.configured) return "Configure Postgres before syncing pending outbox entries.";
  if (postgresStatus.state !== "ready") return "Postgres must be reachable before syncing pending outbox entries.";
  if (postgresStatus.vectorInstalled !== true) return "Install pgvector before syncing pending outbox entries.";
  if (postgresStatus.schemaReady !== true) return "Run PostgreSQL migrations before syncing pending outbox entries.";
  return null;
};

const getWorkspaceIngestDisabledReason = ({
  mode,
  workspaceState,
  files
}: {
  mode: DocumentMode;
  workspaceState: WorkspaceState;
  files: WorkspaceFileEntry[];
}): string | null => {
  if (mode !== "workspace" || workspaceState !== "open") return "Open a local workspace before scanning workspace ingest.";
  if (!files.some((file) => file.kind === "file" && file.path.toLowerCase().endsWith(".md"))) {
    return "No Markdown files are visible in the current workspace.";
  }
  return null;
};

const buildPersistCommandInput = ({
  source,
  workspace,
  file,
  compileOutput,
  agentRun
}: PersistBuildInput): DesktopCommandMap["persist_runtime_graph_rag"]["input"] => {
  const sourceHash = createEditorSourceHash(source);
  const documentHash = createEditorSourceHash(`${workspace.workspaceId}:${file.path}`);
  const revisionId = `desktop:${documentHash}:fnv1a:${sourceHash}`;
  const experimentId = `desktop:${workspace.workspaceId}:${documentHash}`;
  const records = buildEditorGraphRagRecords({
    source,
    documentUri: file.path,
    experimentId,
    revisionId,
    createdAt: new Date().toISOString(),
    compileOutput
  });
  const input = buildPersistRuntimeGraphRagCommandInput({
    records,
    source,
    workspace: {
      workspaceId: workspace.workspaceId,
      rootPath: workspace.rootPath,
      displayName: workspace.displayName
    },
    document: {
      path: file.path,
      documentId: file.id,
      documentUri: file.path,
      name: file.name,
      revisionId,
      experimentId
    },
    agentRun
  });
  return input as unknown as DesktopCommandMap["persist_runtime_graph_rag"]["input"];
};

const formatRange = (range: ChemdTextEdit["range"]): string =>
  `L${range.startLine}:C${range.startColumn}-L${range.endLine}:C${range.endColumn}`;

const formatSidecarStartedAt = (startedAt: string | null): string => {
  if (!startedAt) {
    return "not running";
  }
  const numericTimestamp = Number(startedAt);
  const date = Number.isFinite(numericTimestamp)
    ? new Date(numericTimestamp)
    : new Date(startedAt);
  return Number.isNaN(date.getTime()) ? startedAt : date.toLocaleString();
};

const createAgentId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const getLatestPatchProposal = (run: AgentRun | null): PatchProposal | undefined =>
  run?.patchProposals[run.patchProposals.length - 1];

const findPatchDecision = (
  run: AgentRun | null,
  patchProposalId: string | undefined,
  kind: PatchDecision["kind"]
): PatchDecision | undefined =>
  patchProposalId === undefined
    ? undefined
    : run?.patchDecisions.find((decision) =>
        decision.patchProposalId === patchProposalId && decision.kind === kind
      );

const createDiagnosticEvidence = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry
): AgentEvidence => ({
  kind: "diagnostic",
  documentId: file.id,
  filePath: file.path,
  sourceRange: diagnostic.range,
  summary: `${diagnostic.code}: ${diagnostic.message}`,
  citation: {
    citationId: `diagnostic:${quickFix.id}`,
    sourceLabel: `${diagnostic.code} quick fix`,
    documentId: file.id,
    filePath: file.path,
    sourceRange: diagnostic.range
  }
});

const createQuickFixPatchProposal = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry,
  evidence: AgentEvidence
): PatchProposal => ({
  patchProposalId: createAgentId("patch"),
  documentId: file.id,
  baseRevisionId: quickFix.patch.beforeHash,
  beforeHash: quickFix.patch.beforeHash,
  title: quickFix.title,
  rationale: `Use language-service quick fix for ${diagnostic.code}: ${diagnostic.message}`,
  edits: quickFix.patch.edits,
  evidence: [evidence]
});

const createProposalToolCall = ({
  runId,
  toolCallId,
  workspaceId,
  file,
  candidate,
  evidence,
  at
}: {
  runId: string;
  toolCallId: string;
  workspaceId: string;
  file: WorkspaceFileEntry;
  candidate: QuickFixCandidate;
  evidence: AgentEvidence;
  at: string;
}): AgentToolCall => ({
  toolCallId,
  agentRunId: runId,
  workspaceId,
  toolName: "propose_repair",
  payload: {
    diagnosticCode: candidate.diagnostic.code,
    quickFixId: candidate.quickFix.id,
    filePath: file.path
  },
  status: "ok",
  startedAt: at,
  finishedAt: at,
  result: createToolResult({
    toolCallId,
    status: "ok",
    payload: {
      title: candidate.quickFix.title,
      edits: candidate.quickFix.patch.edits.length
    },
    evidence: [evidence]
  })
});

const createAgentProposalRun = (
  candidate: QuickFixCandidate,
  file: WorkspaceFileEntry,
  workspaceId: string
): AgentOperationResult => {
  const now = new Date().toISOString();
  const runId = createAgentId("run");
  const toolCallId = createAgentId("tool");
  const evidence = createDiagnosticEvidence(candidate.diagnostic, candidate.quickFix, file);
  const patchProposal = createQuickFixPatchProposal(
    candidate.diagnostic,
    candidate.quickFix,
    file,
    evidence
  );
  const toolCall = createProposalToolCall({
    runId,
    toolCallId,
    workspaceId,
    file,
    candidate,
    evidence,
    at: now
  });
  const createdRun = createAgentRun({
    agentRunId: runId,
    workspaceId,
    goal: `Prepare quick fix patch for ${file.path}`,
    targetFiles: [file.path],
    createdAt: now
  });
  const runningResult = transitionAgentRunStatus(createdRun, {
    status: "running",
    at: now,
    summary: "Collected current language-service diagnostics."
  });
  if (!runningResult.ok) {
    return { run: runningResult.run, message: { tone: "danger", text: runningResult.error.message } };
  }

  const toolResult = appendToolCall(runningResult.run, {
    toolCall,
    at: now,
    summary: `Proposed repair from quick fix ${candidate.quickFix.id}.`
  });
  if (!toolResult.ok) {
    return { run: toolResult.run, message: { tone: "danger", text: toolResult.error.message } };
  }

  const evidenceResult = attachEvidence(toolResult.run, {
    evidence: [evidence],
    at: now,
    summary: `Attached diagnostic evidence for ${candidate.diagnostic.code}.`
  });
  if (!evidenceResult.ok) {
    return { run: evidenceResult.run, message: { tone: "danger", text: evidenceResult.error.message } };
  }

  const proposalResult = proposePatch(evidenceResult.run, {
    patchProposal,
    at: now,
    summary: `Patch proposal awaits explicit approval: ${patchProposal.title}.`
  });
  return {
    run: proposalResult.run,
    message: proposalResult.ok
      ? { tone: "info", text: "Review the patch proposal, then approve before applying." }
      : { tone: "danger", text: proposalResult.error.message }
  };
};

const approveAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const result = approvePatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: createAgentId("approval"),
    reason: "User explicitly approved patch proposal.",
    decidedAt: new Date().toISOString()
  });
  return {
    run: result.run,
    message: result.ok
      ? { tone: "success", text: "Patch approved. Apply is now enabled for the current buffer." }
      : { tone: "danger", text: result.error.message }
  };
};

const applyAgentRunPatch = (
  run: AgentRun,
  source: string
): { result: AgentOperationResult; nextSource?: string } | null => {
  const activeProposal = getLatestPatchProposal(run);
  const approvedDecision = findPatchDecision(run, activeProposal?.patchProposalId, "approved");
  if (!activeProposal || !approvedDecision) return null;

  const appliedResult = applyPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: approvedDecision.userApprovalId,
    reason: "Applied approved patch to current editor buffer.",
    decidedAt: new Date().toISOString(),
    currentBeforeHash: createEditorSourceHash(source)
  });
  if (!appliedResult.ok) {
    return {
      result: {
        run: appliedResult.run,
        message: { tone: "danger", text: appliedResult.error.message }
      }
    };
  }

  const completedResult = transitionAgentRunStatus(appliedResult.run, {
    status: "completed",
    at: new Date().toISOString(),
    summary: "Applied approved patch to the editor buffer.",
    finalSummary: "Patch applied locally. Save remains under the normal workspace save flow."
  });
  return {
    nextSource: applyTextEdits(source, activeProposal.edits),
    result: {
      run: completedResult.run,
      message: completedResult.ok
        ? { tone: "success", text: "Patch applied to the editor buffer. Use Save to persist it." }
        : { tone: "danger", text: completedResult.error.message }
    }
  };
};

const rejectAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const rejectedResult = rejectPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    reason: "User rejected patch proposal.",
    decidedAt: new Date().toISOString()
  });
  if (!rejectedResult.ok) {
    return {
      run: rejectedResult.run,
      message: { tone: "danger", text: rejectedResult.error.message }
    };
  }

  const canceledResult = transitionAgentRunStatus(rejectedResult.run, {
    status: "canceled",
    at: new Date().toISOString(),
    summary: "Patch proposal rejected by user.",
    finalSummary: "No editor changes were applied."
  });
  return {
    run: canceledResult.run,
    message: canceledResult.ok
      ? { tone: "warning", text: "Patch rejected. The editor buffer was not changed." }
      : { tone: "danger", text: canceledResult.error.message }
  };
};

const PanelHeader = ({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) => (
  <div className="desktop-panel-header">
    <div className="desktop-panel-title-group"><p className="desktop-panel-eyebrow">{eyebrow}</p><h2>{title}</h2></div>
    <span className="desktop-panel-meta">{meta}</span>
  </div>
);

const StatusBadge = ({ label, state, detail }: { label: string; state: RuntimeState; detail: string }) => (
  <span className="desktop-status-badge" data-state={statusToneByState[state]} title={detail}><span className="desktop-status-dot" />{label}</span>
);

const SidecarButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof PlayCircle;
  operation: SidecarOperation;
  activeOperation: SidecarOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <button type="button" className="desktop-button" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
};

const PostgresControlButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof PlayCircle;
  operation: ManagedPostgresOperation;
  activeOperation: ManagedPostgresOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <button type="button" className="desktop-button" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
};

const LocalStoreButton = ({
  label,
  loadingLabel,
  icon: Icon,
  operation,
  activeOperation,
  disabled,
  onClick
}: {
  label: string;
  loadingLabel: string;
  icon: typeof PlayCircle;
  operation: LocalStoreOperation;
  activeOperation: LocalStoreOperation | null;
  disabled: boolean;
  onClick: () => void;
}) => {
  const loading = activeOperation === operation;
  return (
    <button type="button" className="desktop-button" disabled={disabled} aria-busy={loading} onClick={onClick}>
      <Icon size={14} />
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
};

const SidecarControlPanel = ({
  status,
  logTail,
  operation,
  message,
  errorMessage,
  onStart,
  onStop,
  onRefresh,
  onLoadLogs
}: {
  status: SidecarStatus;
  logTail: string[];
  operation: SidecarOperation | null;
  message: string | null;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  onRefresh: () => void;
  onLoadLogs: () => void;
}) => {
  const busy = operation !== null;
  const canStart = !busy && status.state !== "ready" && status.pid === null;
  const canStop = !busy && (status.state === "ready" || status.pid !== null);
  const visibleLogTail = logTail.length > 0 ? logTail : status.logTail;

  return (
    <section className="desktop-sidecar-panel" aria-label="chem-service sidecar controls">
      <div className="desktop-sidecar-heading">
        <div className="desktop-agent-subhead"><FlaskConical size={14} /><span>chem-service sidecar</span></div>
        <StatusBadge label={status.label} state={status.state} detail={status.detail} />
      </div>
      <div className="desktop-sidecar-actions">
        <SidecarButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!canStart} onClick={onStart} />
        <SidecarButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!canStop} onClick={onStop} />
        <SidecarButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={busy} onClick={onRefresh} />
        <SidecarButton label="Load logs" loadingLabel="Loading" icon={ScrollText} operation="logs" activeOperation={operation} disabled={busy} onClick={onLoadLogs} />
      </div>
      <dl className="desktop-sidecar-fields">
        <div><dt>State</dt><dd>{status.state}</dd></div>
        <div><dt>PID</dt><dd>{status.pid ?? "none"}</dd></div>
        <div><dt>Started</dt><dd>{formatSidecarStartedAt(status.startedAt)}</dd></div>
        <div><dt>Detail</dt><dd>{status.detail}</dd></div>
      </dl>
      {errorMessage ? <p className="desktop-sidecar-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="desktop-sidecar-message" data-tone="info">{message}</p> : null}
      <div className="desktop-sidecar-log" aria-label="chem-service log tail">
        {visibleLogTail.length > 0
          ? visibleLogTail.map((line, index) => <code key={`${index}-${line}`}>{line}</code>)
          : <span>No log tail loaded.</span>}
      </div>
    </section>
  );
};

const PostgresFieldGrid = ({ fields, wideLabels = ["Detail"] }: { fields: PostgresField[]; wideLabels?: string[] }) => (
  <dl className="desktop-postgres-fields">
    {fields.map(([label, value]) => (
      <div key={label} className={wideLabels.includes(label) ? "desktop-postgres-field-wide" : undefined}>
        <dt>{label}</dt>
        <dd title={value}>{value}</dd>
      </div>
    ))}
  </dl>
);

const PostgresReadinessList = ({ items }: { items: PostgresReadinessItem[] }) => (
  <div className="desktop-postgres-readiness" aria-label="Postgres migration readiness">
    {items.map((item) => (
      <div key={item.id} data-tone={item.tone}>
        <span>{item.label}</span>
        <strong>{item.value}</strong>
        <small>{item.reason}</small>
      </div>
    ))}
  </div>
);

const ExternalPostgresSection = ({ status }: { status: PostgresStatus }) => {
  const externalConfigured = getExternalConfigured(status);
  const readiness = buildExternalPostgresReadiness(status);
  return (
    <div className="desktop-postgres-subpanel">
      <div className="desktop-postgres-subhead">
        <span>External Postgres</span>
        <small>{externalConfigured ? "priority target" : "not selected"}</small>
      </div>
      <PostgresReadinessList items={readiness} />
      <PostgresFieldGrid fields={getExternalPostgresFields(status)} />
    </div>
  );
};

const ManagedPostgresSection = ({
  status,
  runtimeStatus,
  loading,
  operation,
  errorMessage,
  message,
  onInit,
  onStart,
  onStop,
  onMigrate,
  onRefresh
}: {
  status: ManagedPostgresStatus;
  runtimeStatus: PostgresStatus;
  loading: boolean;
  operation: ManagedPostgresOperation | null;
  errorMessage: string | null;
  message: string | null;
  onInit: () => void;
  onStart: () => void;
  onStop: () => void;
  onMigrate: () => void;
  onRefresh: () => void;
}) => {
  const unavailableMessage = getManagedPostgresUnavailableMessage(status);
  const controls = getManagedPostgresControlState(status, loading, operation);
  const readiness = buildManagedPostgresReadiness(status, runtimeStatus);

  return (
    <div className="desktop-postgres-subpanel">
      <div className="desktop-postgres-subhead">
        <span>Managed Postgres</span>
        <small>{status.configured ? "local config" : "local fallback"}</small>
      </div>
      <div className="desktop-managed-actions">
        <PostgresControlButton label="Init" loadingLabel="Initializing" icon={Wrench} operation="init" activeOperation={operation} disabled={!controls.canInit} onClick={onInit} />
        <PostgresControlButton label="Start" loadingLabel="Starting" icon={PlayCircle} operation="start" activeOperation={operation} disabled={!controls.canStart} onClick={onStart} />
        <PostgresControlButton label="Stop" loadingLabel="Stopping" icon={Square} operation="stop" activeOperation={operation} disabled={!controls.canStop} onClick={onStop} />
        <PostgresControlButton label="Migrate" loadingLabel="Migrating" icon={UploadCloud} operation="migrate" activeOperation={operation} disabled={!controls.canMigrate} onClick={onMigrate} />
        <PostgresControlButton label="Refresh" loadingLabel="Refreshing" icon={RefreshCw} operation="refresh" activeOperation={operation} disabled={!controls.canRefresh} onClick={onRefresh} />
      </div>
      {unavailableMessage ? <p className="desktop-postgres-message" data-tone="warning">{unavailableMessage}</p> : null}
      {errorMessage ? <p className="desktop-postgres-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {message ? <p className="desktop-postgres-message" data-tone="info">{message}</p> : null}
      <PostgresReadinessList items={readiness} />
      <PostgresFieldGrid fields={getManagedPostgresFields(status)} wideLabels={["Data dir", "Detail"]} />
    </div>
  );
};

const PostgresProfileManagerSection = ({ profiles }: { profiles: PostgresProfilePanelController }) => {
  const busy = profiles.operation !== null;
  const updateField = (field: keyof PostgresProfileForm) => (
    event: ReactChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const value = event.currentTarget.type === "checkbox"
      ? (event.currentTarget as HTMLInputElement).checked
      : event.currentTarget.value;
    profiles.onFormChange({ [field]: value } as Partial<PostgresProfileForm>);
  };

  return (
    <div className="desktop-postgres-subpanel desktop-postgres-profile-manager">
      <div className="desktop-postgres-subhead">
        <span>Connection profiles</span>
        <small>{profiles.state.profiles.length} saved</small>
      </div>
      <div className="desktop-postgres-actions">
        <button type="button" className="desktop-button" disabled={busy} onClick={profiles.onRefreshProfiles}>
          <RefreshCw size={14} />
          <span>{profiles.operation === "list" ? "Loading" : "List"}</span>
        </button>
        <button type="button" className="desktop-button" disabled={busy} onClick={profiles.onResetForm}>
          <FileCode2 size={14} />
          <span>New</span>
        </button>
        <button type="button" className="desktop-button-primary" disabled={busy} onClick={profiles.onSaveProfile}>
          <ShieldCheck size={14} />
          <span>{profiles.operation === "save" ? "Saving" : "Save"}</span>
        </button>
      </div>
      {profiles.error ? (
        <div className="desktop-postgres-command-error" role="alert">
          <div>
            <strong>{profiles.error.operation} failed</strong>
            <code>{profiles.error.code}</code>
          </div>
          <p>{profiles.error.message}</p>
          {profiles.error.detail ? <small>{profiles.error.detail}</small> : null}
        </div>
      ) : null}
      {profiles.message ? <p className="desktop-postgres-message" data-tone="info">{profiles.message}</p> : null}
      <div className="desktop-postgres-profile-form">
        <label>
          <span>Label</span>
          <input value={profiles.form.label} onChange={updateField("label")} />
        </label>
        <label>
          <span>Host</span>
          <input value={profiles.form.host} onChange={updateField("host")} />
        </label>
        <label>
          <span>Port</span>
          <input inputMode="numeric" value={profiles.form.port} onChange={updateField("port")} />
        </label>
        <label>
          <span>Database</span>
          <input value={profiles.form.database} onChange={updateField("database")} />
        </label>
        <label>
          <span>User</span>
          <input value={profiles.form.user} onChange={updateField("user")} />
        </label>
        <label>
          <span>Password</span>
          <input type="password" value={profiles.form.password} autoComplete="new-password" onChange={updateField("password")} />
        </label>
        <label>
          <span>SSL mode</span>
          <select value={profiles.form.sslmode} onChange={updateField("sslmode")}>
            <option value="require">require</option>
            <option value="prefer">prefer</option>
            <option value="disable">disable</option>
            <option value="verify-ca">verify-ca</option>
            <option value="verify-full">verify-full</option>
          </select>
        </label>
        <label>
          <span>Timeout</span>
          <input inputMode="numeric" value={profiles.form.timeoutMs} onChange={updateField("timeoutMs")} />
        </label>
        <label>
          <span>Pool</span>
          <input value={profiles.form.pool} placeholder="default" onChange={updateField("pool")} />
        </label>
        <label className="desktop-postgres-profile-check">
          <input type="checkbox" checked={profiles.form.setActive} onChange={updateField("setActive")} />
          <span>Set active</span>
        </label>
      </div>
      <div className="desktop-postgres-profile-list" aria-label="Saved Postgres profiles">
        {profiles.rows.length > 0 ? profiles.rows.map((profile) => (
          <div key={profile.profileId} className="desktop-postgres-profile-row" data-active={profile.active}>
            <div className="desktop-postgres-profile-main">
              <strong>{profile.label}</strong>
              <span>{profile.target} / {profile.userDatabase}</span>
            </div>
            <div className="desktop-postgres-profile-badges">
              <span data-tone={profile.active ? "success" : "muted"}>{profile.active ? "active" : "inactive"}</span>
              <span data-tone={profile.passwordSaved ? "success" : "warning"}>
                {profile.passwordSaved ? "passwordSaved" : "no password"}
              </span>
              <span>{profile.sslmode}</span>
              <span>{profile.timeout}</span>
            </div>
            <div className="desktop-postgres-profile-actions">
              <button type="button" className="desktop-button" disabled={busy} onClick={() => profiles.onEditProfile(profile.profileId)}>
                <Settings size={13} />
                <span>Edit</span>
              </button>
              <button type="button" className="desktop-button" disabled={busy || profile.active} onClick={() => profiles.onActivateProfile(profile.profileId)}>
                <CheckCircle2 size={13} />
                <span>Activate</span>
              </button>
              <button type="button" className="desktop-button" disabled={busy} onClick={() => profiles.onDeleteProfile(profile.profileId)}>
                <XCircle size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )) : <p className="desktop-empty-copy">No Postgres profiles saved. Offline Core authoring remains available.</p>}
      </div>
    </div>
  );
};

const PostgresStatusPanel = ({
  status,
  managedStatus,
  loading,
  managedOperation,
  errorMessage,
  managedErrorMessage,
  managedMessage,
  profiles,
  persistState,
  persistDisabledReason,
  onRefresh,
  onInitManaged,
  onStartManaged,
  onStopManaged,
  onMigrateManaged,
  onRefreshManaged,
  onPersistGraph
}: {
  status: PostgresStatus;
  managedStatus: ManagedPostgresStatus;
  loading: boolean;
  managedOperation: ManagedPostgresOperation | null;
  errorMessage: string | null;
  managedErrorMessage: string | null;
  managedMessage: string | null;
  profiles: PostgresProfilePanelController;
  persistState: PersistState;
  persistDisabledReason: string | null;
  onRefresh: () => void;
  onInitManaged: () => void;
  onStartManaged: () => void;
  onStopManaged: () => void;
  onMigrateManaged: () => void;
  onRefreshManaged: () => void;
  onPersistGraph: () => void;
}) => {
  const activeTarget = getActivePostgresTarget(status, managedStatus);
  return (
    <section className="desktop-postgres-panel" aria-label="Postgres runtime status">
      <div className="desktop-postgres-heading">
        <div className="desktop-agent-subhead"><Database size={14} /><span>Postgres runtime</span></div>
        <StatusBadge label={status.label} state={status.state} detail={status.detail} />
      </div>
      <div className="desktop-postgres-target" data-target={activeTarget.toLowerCase()}>
        <strong>{activeTarget}</strong>
        <span>{getPostgresTargetMessage(status, managedStatus)}</span>
      </div>
      <div className="desktop-postgres-actions">
        <button type="button" className="desktop-button" disabled={loading} aria-busy={loading} onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>{loading ? "Refreshing" : "Refresh all"}</span>
        </button>
        <button
          type="button"
          className="desktop-button-primary"
          disabled={persistState.state === "pending" || persistDisabledReason !== null}
          aria-busy={persistState.state === "pending"}
          onClick={onPersistGraph}
        >
          {persistState.state === "pending" ? <RefreshCw size={14} /> : <UploadCloud size={14} />}
          <span>{persistState.state === "pending" ? "Persisting" : "Persist graph"}</span>
        </button>
      </div>
      {errorMessage ? <p className="desktop-postgres-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      {persistDisabledReason ? <p className="desktop-postgres-message" data-tone="warning">{persistDisabledReason}</p> : null}
      <div className="desktop-persist-status" data-state={persistState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{persistState.state}</span>
          <p>{persistState.message}</p>
        </div>
        {persistState.summary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Graph snapshot</dt><dd title={persistState.summary.graphSnapshotId}>{summarizeGraphSnapshotId(persistState.summary.graphSnapshotId)}</dd></div>
            <div><dt>Counts</dt><dd>{formatPersistCounts(persistState.summary.counts)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="desktop-postgres-split">
        <PostgresProfileManagerSection profiles={profiles} />
        <ExternalPostgresSection status={status} />
        <ManagedPostgresSection
          status={managedStatus}
          runtimeStatus={status}
          loading={loading}
          operation={managedOperation}
          errorMessage={managedErrorMessage}
          message={managedMessage}
          onInit={onInitManaged}
          onStart={onStartManaged}
          onStop={onStopManaged}
          onMigrate={onMigrateManaged}
          onRefresh={onRefreshManaged}
        />
      </div>
    </section>
  );
};

const LocalStorePanel = ({
  status,
  operation,
  snapshotState,
  syncState,
  reactionIntelligenceJobBuild,
  reactionIntelligenceJobState,
  workspaceIngestState,
  disabledReason,
  syncDisabledReason,
  workspaceIngestDisabledReason,
  errorMessage,
  onRefresh,
  onSave,
  onSync,
  onRunReactionIntelligenceJob,
  onRunWorkspaceIngest
}: {
  status: LocalStoreStatus;
  operation: LocalStoreOperation | null;
  snapshotState: LocalSnapshotState;
  syncState: LocalSyncState;
  reactionIntelligenceJobBuild: DesktopReactionIntelligenceJobBuildResult;
  reactionIntelligenceJobState: DesktopReactionIntelligenceJobState;
  workspaceIngestState: WorkspaceIngestState;
  disabledReason: string | null;
  syncDisabledReason: string | null;
  workspaceIngestDisabledReason: string | null;
  errorMessage: string | null;
  onRefresh: () => void;
  onSave: () => void;
  onSync: () => void;
  onRunReactionIntelligenceJob: () => void;
  onRunWorkspaceIngest: () => void;
}) => {
  const busy = operation !== null;
  const saveDisabled = busy || disabledReason !== null || !status.available;
  const syncDisabled = busy || syncDisabledReason !== null;
  const intelligenceBusy = reactionIntelligenceJobState.status === "running";
  const intelligenceDisabled = intelligenceBusy || reactionIntelligenceJobBuild.state !== "ready" || !status.available;
  const ingestBusy = workspaceIngestState.state === "pending";
  const ingestDisabled = ingestBusy || workspaceIngestDisabledReason !== null;
  const unavailableMessage = status.available
    ? null
    : "Local Store is unavailable. Refresh status before relying on the offline outbox.";

  return (
    <section className="desktop-local-store-panel" aria-label="Offline Local Store">
      <div className="desktop-local-store-heading">
        <div className="desktop-agent-subhead"><HardDrive size={14} /><span>Offline Local Store</span></div>
        <StatusBadge label={status.label} state={status.state} detail={status.detail} />
      </div>
      <p className="desktop-local-store-copy">
        Local Store writes the current Graph/RAG/Agent snapshot to a local JSON cache/outbox. External or Managed Postgres remains the sync target after reconnect.
      </p>
      <div className="desktop-workspace-ingest-status" data-state={workspaceIngestState.state} aria-live="polite">
        <div className="desktop-workspace-ingest-header">
          <div className="desktop-agent-subhead"><Files size={14} /><span>Workspace Ingest</span></div>
          <button
            type="button"
            className="desktop-button-primary"
            disabled={ingestDisabled}
            aria-busy={ingestBusy}
            onClick={onRunWorkspaceIngest}
          >
            {ingestBusy ? <RefreshCw size={14} /> : <FileCode2 size={14} />}
            <span>{ingestBusy ? "Scanning" : "Scan/Ingest current workspace"}</span>
          </button>
        </div>
        <p>{workspaceIngestState.message}</p>
        {workspaceIngestDisabledReason ? (
          <p className="desktop-local-store-message" data-tone="warning">{workspaceIngestDisabledReason}</p>
        ) : null}
        {workspaceIngestState.summary ? (
          <dl className="desktop-workspace-ingest-summary">
            <div><dt>Total</dt><dd>{workspaceIngestState.summary.totalCount}</dd></div>
            <div><dt>Pending</dt><dd>{workspaceIngestState.summary.pendingCount}</dd></div>
            <div><dt>Skipped</dt><dd>{workspaceIngestState.summary.skippedCount}</dd></div>
            <div><dt>Failed</dt><dd>{workspaceIngestState.summary.failedCount}</dd></div>
            <div><dt>Retryable</dt><dd>{workspaceIngestState.summary.retryableCount}</dd></div>
          </dl>
        ) : null}
        {workspaceIngestState.summary?.errors.length ? (
          <ul className="desktop-workspace-ingest-errors" aria-label="Workspace ingest failures">
            {workspaceIngestState.summary.errors.slice(0, 4).map((error) => (
              <li key={error.queueId}>
                <code title={error.documentPath}>{error.documentPath}</code>
                <span title={error.errorSummary}>{error.errorSummary}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="desktop-reaction-intelligence-status" data-state={reactionIntelligenceJobState.status} aria-live="polite">
        <div className="desktop-workspace-ingest-header">
          <div className="desktop-agent-subhead"><Sparkles size={14} /><span>Reaction Intelligence</span></div>
          <button
            type="button"
            className="desktop-button-primary"
            disabled={intelligenceDisabled}
            aria-busy={intelligenceBusy}
            onClick={onRunReactionIntelligenceJob}
          >
            {intelligenceBusy ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            <span>{intelligenceBusy ? "Running" : "Run intelligence job"}</span>
          </button>
        </div>
        <p>{reactionIntelligenceJobBuild.message}</p>
        <div className="desktop-persist-status-row">
          <span>{reactionIntelligenceJobState.status}</span>
          <p>{reactionIntelligenceJobState.message}</p>
        </div>
        {reactionIntelligenceJobState.artifactSummary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Artifact</dt><dd title={reactionIntelligenceJobState.artifactSummary.artifactId}>{summarizeLocalId(reactionIntelligenceJobState.artifactSummary.artifactId)}</dd></div>
            <div><dt>Edges</dt><dd>{reactionIntelligenceJobState.artifactSummary.similarityEdgeCount}</dd></div>
            <div><dt>Features</dt><dd>{reactionIntelligenceJobState.artifactSummary.reactionFeatureCount}</dd></div>
          </dl>
        ) : null}
        {reactionIntelligenceJobState.error ? (
          <p className="desktop-local-store-message" data-tone="danger">{reactionIntelligenceJobState.error}</p>
        ) : null}
        {reactionIntelligenceJobState.logTail.length > 0 ? (
          <div className="desktop-sidecar-log" aria-label="Reaction intelligence log tail">
            {reactionIntelligenceJobState.logTail.slice(-4).map((line, index) => (
              <code key={`${index}-${line}`}>{line}</code>
            ))}
          </div>
        ) : null}
      </div>
      <div className="desktop-local-store-actions">
        <LocalStoreButton
          label="Refresh Local"
          loadingLabel="Refreshing"
          icon={RefreshCw}
          operation="refresh"
          activeOperation={operation}
          disabled={busy}
          onClick={onRefresh}
        />
        <LocalStoreButton
          label="Save Local Snapshot"
          loadingLabel="Saving"
          icon={HardDrive}
          operation="save"
          activeOperation={operation}
          disabled={saveDisabled}
          onClick={onSave}
        />
        <LocalStoreButton
          label="Sync Pending"
          loadingLabel="Syncing"
          icon={UploadCloud}
          operation="sync"
          activeOperation={operation}
          disabled={syncDisabled}
          onClick={onSync}
        />
      </div>
      {unavailableMessage ? <p className="desktop-local-store-message" data-tone="warning">{unavailableMessage}</p> : null}
      {disabledReason ? <p className="desktop-local-store-message" data-tone="warning">{disabledReason}</p> : null}
      {syncDisabledReason ? <p className="desktop-local-store-message" data-tone="warning">{syncDisabledReason}</p> : null}
      {errorMessage ? <p className="desktop-local-store-message" data-tone="danger" role="alert">{errorMessage}</p> : null}
      <div className="desktop-local-snapshot-status" data-state={snapshotState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{snapshotState.state}</span>
          <p>{snapshotState.message}</p>
        </div>
        {snapshotState.summary ? (
          <dl className="desktop-persist-summary">
            <div><dt>Local id</dt><dd title={snapshotState.summary.localId}>{summarizeLocalId(snapshotState.summary.localId)}</dd></div>
            <div><dt>Pending</dt><dd>{snapshotState.summary.pendingCount}</dd></div>
            <div><dt>Idempotency</dt><dd title={snapshotState.summary.idempotencyKey}>{summarizeLocalId(snapshotState.summary.idempotencyKey)}</dd></div>
          </dl>
        ) : null}
      </div>
      <div className="desktop-local-sync-status" data-state={syncState.state} aria-live="polite">
        <div className="desktop-persist-status-row">
          <span>{syncState.state}</span>
          <p>{syncState.message}</p>
        </div>
        {syncState.summary ? (
          <>
            <dl className="desktop-persist-summary">
              <div><dt>Counts</dt><dd>{formatLocalSyncCounts(syncState.summary)}</dd></div>
              <div><dt>Target</dt><dd>{syncState.summary.target.kind}</dd></div>
              <div><dt>Source</dt><dd title={redactSensitiveRuntimeText(syncState.summary.target.source)}>{redactSensitiveRuntimeText(syncState.summary.target.source)}</dd></div>
              <div><dt>Host</dt><dd>{formatPostgresValue(syncState.summary.target.host)}</dd></div>
              <div><dt>Database</dt><dd>{formatPostgresValue(syncState.summary.target.database)}</dd></div>
              <div><dt>User</dt><dd>{formatPostgresValue(syncState.summary.target.user)}</dd></div>
            </dl>
            {syncState.summary.failedEntries.length > 0 ? (
              <ul className="desktop-local-sync-errors" aria-label="Local outbox sync failures">
                {syncState.summary.failedEntries.slice(0, 4).map((entry) => (
                  <li key={entry.localId}>
                    <code title={entry.localId}>{summarizeLocalId(entry.localId)}</code>
                    <span title={getLocalOutboxErrorText(entry.error)}>{getLocalOutboxErrorText(entry.error)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <dl className="desktop-local-store-fields">
        {getLocalStoreFields(status).map(([label, value]) => (
          <div key={label} className={label === "Storage path" ? "desktop-local-store-field-wide" : undefined}>
            <dt>{label}</dt>
            <dd title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

const TopBar = ({
  workspace,
  workspaceState,
  sidecarStatus,
  postgresStatus,
  diagnosticCount,
  dirty,
  rootPath,
  canSave,
  onRootPathChange,
  onSave,
  onOpenWorkspace
}: {
  workspace: WorkspaceHandle;
  workspaceState: WorkspaceState;
  sidecarStatus: SidecarStatus;
  postgresStatus: PostgresStatus;
  diagnosticCount: number;
  dirty: boolean;
  rootPath: string;
  canSave: boolean;
  onRootPathChange: (value: string) => void;
  onSave: () => void;
  onOpenWorkspace: () => void;
}) => (
  <header className="desktop-topbar">
    <div className="desktop-brand">
      <div className="desktop-logo-mark" aria-hidden="true"><FlaskConical size={16} /></div>
      <div className="desktop-brand-copy"><span className="desktop-product-name">Chemd Desktop IDE</span><span className="desktop-workspace-name">{workspace.displayName}</span></div>
    </div>
    <div className="desktop-topbar-center">
      <input
        className="desktop-path-input"
        value={rootPath}
        onChange={(event) => onRootPathChange(event.target.value)}
        placeholder="D:\\path\\to\\workspace"
        aria-label="Workspace root path"
      />
      <span className="desktop-path-chip" title={workspace.rootHint}>{workspace.rootHint}</span>
    </div>
    <div className="desktop-runtime-badges" aria-label="Runtime status">
      <button type="button" className="desktop-button-primary" disabled={workspaceState === "opening"} onClick={onOpenWorkspace}>{workspaceState === "opening" ? "Opening" : "Open"}</button>
      <button type="button" className="desktop-button" disabled={!canSave} onClick={onSave}>Save</button>
      <StatusBadge label={workspaceStateLabel[workspaceState]} state={workspaceState === "open" ? "ready" : workspaceState === "error" ? "degraded" : "placeholder"} detail="Workspace access uses open_workspace and list_workspace_files" />
      <StatusBadge label={`${diagnosticCount} diagnostics`} state={diagnosticCount > 0 ? "degraded" : "ready"} detail="Computed by @chemd/language-service" />
      <StatusBadge label={dirty ? "Dirty" : "Saved"} state={dirty ? "degraded" : "ready"} detail="Local editor buffer state" />
      <StatusBadge label={sidecarStatus.label} state={sidecarStatus.state} detail={sidecarStatus.detail} />
      <StatusBadge label={`Postgres ${postgresStatus.state}`} state={postgresStatus.state} detail={getPostgresBadgeDetail(postgresStatus)} />
    </div>
  </header>
);

const useDesktopLayout = () => {
  const [layout, setLayout] = useState<DesktopLayoutState>(initialDesktopLayout);
  const style = useMemo(() => ({
    "--desktop-sidebar-width": `${layout.sidebarWidth}px`,
    "--desktop-insight-width": `${layout.insightWidth}px`,
    "--desktop-bottom-height": `${layout.bottomHeight}px`
  }) as CSSProperties, [layout.bottomHeight, layout.insightWidth, layout.sidebarWidth]);

  const togglePanel = (panel: LayoutPanel) => {
    setLayout((current) => toggleLayoutPanel(current, panel));
  };

  const expandPanel = (panel: LayoutPanel) => {
    setLayout((current) => {
      if (!isLayoutPanelCollapsed(current, panel)) return current;
      return toggleLayoutPanel(current, panel);
    });
  };

  const beginResize = (panel: LayoutPanel, event: ReactPointerEvent<HTMLDivElement>) => {
    if (isLayoutPanelCollapsed(layout, panel)) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = getLayoutSize(layout, panel);
    document.body.dataset.desktopResizePanel = panel;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = getResizeDelta(panel, startX, startY, moveEvent);
      setLayout((current) => setLayoutSize(current, panel, startSize + delta));
    };
    const onEnd = () => {
      delete document.body.dataset.desktopResizePanel;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const handleKeyDown = (panel: LayoutPanel, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      togglePanel(panel);
      return;
    }
    const delta = getKeyboardResizeDelta(panel, event.key);
    if (delta === 0) return;
    event.preventDefault();
    setLayout((current) => {
      const expanded = isLayoutPanelCollapsed(current, panel) ? toggleLayoutPanel(current, panel) : current;
      return setLayoutSize(expanded, panel, getLayoutSize(expanded, panel) + delta);
    });
  };

  const resetPanel = (panel: LayoutPanel) => {
    setLayout((current) => setLayoutSize(current, panel, layoutBounds[panel].defaultValue));
  };

  return { layout, style, beginResize, togglePanel, expandPanel, handleKeyDown, resetPanel };
};

const ActivityRail = ({
  activeTool,
  onSelectTool
}: {
  activeTool: ActivityTool;
  onSelectTool: (tool: ActivityTool) => void;
}) => (
  <nav className="desktop-activity-rail" aria-label="Primary tools">
    {activityItems.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        type="button"
        className="desktop-rail-button"
        data-active={id === activeTool}
        aria-label={label}
        aria-pressed={id === activeTool}
        title={label}
        onClick={() => onSelectTool(id)}
      >
        <Icon size={18} />
      </button>
    ))}
  </nav>
);

const ResizeHandle = ({
  panel,
  collapsed,
  value,
  onPointerDown,
  onKeyDown,
  onToggle,
  onReset
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
  const label = panel === "sidebar" ? "Files sidebar" : panel === "insight" ? "Insight sidebar" : "Bottom panel";
  const ToggleIcon = panel === "sidebar"
    ? collapsed ? PanelLeftOpen : PanelLeftClose
    : panel === "insight"
      ? collapsed ? PanelRightOpen : PanelRightClose
      : collapsed ? PanelBottomOpen : PanelBottomClose;
  const GripIcon = orientation === "vertical" ? GripVertical : GripHorizontal;

  return (
    <div
      className="desktop-resize-handle"
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
      <GripIcon className="desktop-resize-grip" size={14} aria-hidden="true" />
      <button
        type="button"
        className="desktop-resize-toggle"
        aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        title={collapsed ? `Expand ${label}` : `Collapse ${label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onToggle}
      >
        <ToggleIcon size={14} />
      </button>
    </div>
  );
};

const Sidebar = ({
  files,
  selectedFileId,
  mode,
  message,
  outline,
  diagnostics,
  compileStatus,
  onSelectFile
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
  const [primaryTab, setPrimaryTab] = useState<SidebarPrimaryTab>("files");
  const [secondaryTab, setSecondaryTab] = useState<SidebarSecondaryTab>("workspace");
  const selectedFile = files.find((file) => file.id === selectedFileId);
  const stats = getDiagnosticStats(diagnostics);
  const primaryTabs: SidebarTabItem<SidebarPrimaryTab>[] = [
    { id: "files", label: "Files", icon: Files, badge: `${files.length}` },
    { id: "outline", label: "Outline", icon: ScrollText, badge: `${outline.length}` },
    { id: "problems", label: "Problems", icon: AlertTriangle, badge: `${diagnostics.length}` }
  ];
  const secondaryTabs: SidebarTabItem<SidebarSecondaryTab>[] = [
    { id: "workspace", label: "Workspace", icon: Sparkles },
    { id: "summary", label: "Summary", icon: Activity }
  ];

  return (
    <aside className="desktop-sidebar">
      <section className="desktop-sidebar-window" data-window="primary" aria-label="Sidebar primary window">
        <SidebarTabs items={primaryTabs} active={primaryTab} onSelect={setPrimaryTab} />
        <div className="desktop-sidebar-window-body">
          {primaryTab === "files" ? (
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
          ) : null}
          {primaryTab === "outline" ? (
            outline.length > 0 ? <OutlineTree items={outline} /> : <p className="desktop-empty-copy">No outline from language service.</p>
          ) : null}
          {primaryTab === "problems" ? (
            <div className="desktop-sidebar-problem-list" role={diagnostics.length > 0 ? "list" : undefined}>
              {diagnostics.length > 0 ? diagnostics.map((diagnostic) => (
                <div key={`${diagnostic.code}-${diagnostic.range.startLine}-${diagnostic.message}`} className="desktop-sidebar-problem-row" data-severity={diagnostic.severity} role="listitem">
                  <span>{diagnostic.severity}</span>
                  <strong>{diagnostic.code}</strong>
                  <p>{diagnostic.message}</p>
                  <code>L{diagnostic.range.startLine}:C{diagnostic.range.startColumn}</code>
                </div>
              )) : <p className="desktop-empty-copy">Language service reports no diagnostics.</p>}
            </div>
          ) : null}
        </div>
      </section>
      <section className="desktop-sidebar-window" data-window="secondary" aria-label="Sidebar secondary window">
        <SidebarTabs items={secondaryTabs} active={secondaryTab} onSelect={setSecondaryTab} />
        <div className="desktop-sidebar-window-body">
          {secondaryTab === "workspace" ? (
            <div className="desktop-sidebar-note" data-mode={mode}><Sparkles size={14} /><span>{message}</span></div>
          ) : null}
          {secondaryTab === "summary" ? (
            <dl className="desktop-sidebar-summary">
              <div><dt>Mode</dt><dd>{mode}</dd></div>
              <div><dt>Selected</dt><dd>{selectedFile?.name ?? "none"}</dd></div>
              <div><dt>Compile</dt><dd>{compileStatus}</dd></div>
              <div><dt>Problems</dt><dd>{stats.errors}E / {stats.warnings}W / {stats.infos}I</dd></div>
            </dl>
          ) : null}
        </div>
      </section>
    </aside>
  );
};

function SidebarTabs<T extends string>({
  items,
  active,
  onSelect
}: {
  items: SidebarTabItem<T>[];
  active: T;
  onSelect: (id: T) => void;
}) {
  return (
    <div className="desktop-sidebar-tabs" role="tablist">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button key={item.id} type="button" role="tab" aria-selected={item.id === active} data-active={item.id === active} onClick={() => onSelect(item.id)}>
            <Icon size={13} />
            <span>{item.label}</span>
            {item.badge ? <code>{item.badge}</code> : null}
          </button>
        );
      })}
    </div>
  );
}

const EditorPane = ({
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
  onKeepLocalWorkspaceConflict
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
  <section className="desktop-pane desktop-editor-pane" aria-label="Editor">
    <PanelHeader eyebrow="Editor" title={fileName} meta={`${lineCount} lines`} />
    <div className="desktop-editor-toolbar"><Activity size={15} /><span className="desktop-toolbar-text">{mode === "sample" ? "Bundled sample buffer" : "Local workspace file"}</span><span className="desktop-toolbar-divider" /><span className="desktop-toolbar-text">Compiled {new Date(compiledAt).toLocaleTimeString()}</span></div>
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

const WorkspaceConflictPanel = ({
  conflict,
  onReload,
  onKeepLocal
}: {
  conflict: WorkspaceConflictState;
  onReload: () => void;
  onKeepLocal: () => void;
}) => (
  <div className="desktop-workspace-conflict" role="alert" aria-live="assertive">
    <div className="desktop-workspace-conflict-copy">
      <AlertTriangle size={15} aria-hidden="true" />
      <div>
        <strong>Workspace file changed on disk</strong>
        <p>{conflict.message}</p>
      </div>
    </div>
    <div className="desktop-workspace-conflict-actions">
      <button type="button" className="desktop-button-primary" disabled={conflict.reloading} aria-busy={conflict.reloading} onClick={onReload}>
        <RefreshCw size={14} />{conflict.reloading ? "Reloading" : "Reload from disk"}
      </button>
      <button type="button" className="desktop-button" disabled={conflict.reloading} onClick={onKeepLocal}>
        Keep local editing
      </button>
    </div>
  </div>
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

const getQuickFixCandidates = (diagnostics: ChemdEditorDiagnostic[]): QuickFixCandidate[] =>
  diagnostics.flatMap((diagnostic) =>
    diagnostic.quickFixes.map((quickFix) => ({ diagnostic, quickFix }))
  );

const getDiagnosticStats = (diagnostics: ChemdEditorDiagnostic[]) => ({
  errors: diagnostics.filter((item) => item.severity === "error").length,
  warnings: diagnostics.filter((item) => item.severity === "warning").length,
  infos: diagnostics.filter((item) => item.severity === "info").length
});

const AgentRunHeader = ({
  agentRun,
  agentMessage
}: {
  agentRun: AgentRun | null;
  agentMessage: AgentMessage | null;
}) => (
  <>
    <div className="desktop-agent-heading">
      <Bot size={15} />
      <span>Agent run</span>
      <span className="desktop-agent-status" data-status={agentRun?.status ?? "created"}>
        {agentRun ? agentStatusLabel[agentRun.status] : "Idle"}
      </span>
    </div>
    {agentMessage ? <p className="desktop-agent-message" data-tone={agentMessage.tone}>{agentMessage.text}</p> : null}
  </>
);

const AgentEmptyState = ({
  mode,
  hasQuickFixes
}: {
  mode: DocumentMode;
  hasQuickFixes: boolean;
}) => (
  mode === "workspace" && hasQuickFixes ? null : (
    <div className="desktop-agent-empty">
      {mode !== "workspace"
        ? "Open a local workspace to let Agent propose edits against real files."
        : "No language-service quick fixes are available for this buffer."}
    </div>
  )
);

const AgentQuickFixList = ({
  mode,
  quickFixes,
  onProposeQuickFix
}: {
  mode: DocumentMode;
  quickFixes: QuickFixCandidate[];
  onProposeQuickFix: (candidate: QuickFixCandidate) => void;
}) => (
  <div className="desktop-quickfix-list">
    {quickFixes.length > 0 ? quickFixes.map((candidate) => (
      <button
        key={candidate.quickFix.id}
        type="button"
        disabled={mode !== "workspace"}
        onClick={() => onProposeQuickFix(candidate)}
      >
        <Lightbulb size={14} />
        <span>{candidate.quickFix.title}</span>
      </button>
    )) : <span className="desktop-empty-copy">No quick fixes available.</span>}
  </div>
);

const SemanticPreviewPanel = ({
  preview,
  workspaceSymbolIndexState,
  workspaceSymbolIndexMessage,
  workspaceSymbolIndexSummary
}: {
  preview: DesktopSemanticPreview;
  workspaceSymbolIndexState: PersistOperationState;
  workspaceSymbolIndexMessage: string;
  workspaceSymbolIndexSummary: DesktopWorkspaceSymbolIndexSummary | null;
}) => (
  <div className="desktop-preview-surface">
    <div className="desktop-document-preview" data-state={preview.state}>
      <p className="desktop-preview-kicker">{preview.message}</p>
      <dl>
        <div><dt>Preview</dt><dd>{preview.state}</dd></div>
        <div><dt>Compiled</dt><dd>{new Date(preview.compiledAt).toLocaleTimeString()}</dd></div>
        <div><dt>Workspace index</dt><dd>{workspaceSymbolIndexState}</dd></div>
        <div><dt>Documents</dt><dd>{workspaceSymbolIndexSummary?.indexedFiles ?? 0} indexed</dd></div>
      </dl>
      <p>{workspaceSymbolIndexMessage}</p>
      {preview.state === "ready" ? (
        <div
          className="desktop-semantic-preview-html"
          // HTML is produced by @chemd/renderer-html, which escapes source text.
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
      ) : (
        <p>{preview.reason ?? "preview_unavailable"}</p>
      )}
    </div>
  </div>
);

const AgentPatchProposalCard = ({
  proposal,
  canApprove,
  canApply,
  canReject,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
}: {
  proposal?: PatchProposal;
  canApprove: boolean;
  canApply: boolean;
  canReject: boolean;
  onApprovePatch: () => void;
  onApplyPatch: () => void;
  onRejectPatch: () => void;
}) => (
  proposal ? (
    <div className="desktop-agent-proposal">
      <div className="desktop-agent-subhead"><Wrench size={14} /><span>{proposal.title}</span></div>
      <p>{proposal.rationale}</p>
      <ul className="desktop-agent-edit-list">
        {proposal.edits.map((edit, index) => (
          <li key={`${proposal.patchProposalId}-${index}`}>
            <span>{formatRange(edit.range)}</span>
            <code>{edit.replacement.split(/\r?\n/, 1)[0] || "empty replacement"}</code>
          </li>
        ))}
      </ul>
      <div className="desktop-agent-action-row">
        <button type="button" className="desktop-button" disabled={!canApprove} onClick={onApprovePatch}><ShieldCheck size={14} />Approve</button>
        <button type="button" className="desktop-button-primary" disabled={!canApply} onClick={onApplyPatch}><PlayCircle size={14} />Apply</button>
        <button type="button" className="desktop-button" disabled={!canReject} onClick={onRejectPatch}><XCircle size={14} />Reject</button>
      </div>
    </div>
  ) : null
);

const AgentTimeline = ({ agentRun }: { agentRun: AgentRun | null }) => {
  const timeline = agentRun ? getAuditTimeline(agentRun) : [];
  return (
    <div className="desktop-agent-timeline">
      <div className="desktop-agent-subhead"><Activity size={14} /><span>Timeline</span></div>
      {timeline.length > 0 ? timeline.map((event) => (
        <div key={event.eventId} className="desktop-agent-timeline-row" data-type={event.type}>
          <span>{auditEventLabel[event.type]}</span>
          <p>{event.summary}</p>
          <time dateTime={event.at}>{event.at ? new Date(event.at).toLocaleTimeString() : "now"}</time>
        </div>
      )) : <p className="desktop-empty-copy">No agent run has started.</p>}
    </div>
  );
};

const AgentLedger = ({ agentRun }: { agentRun: AgentRun | null }) => (
  agentRun ? (
    <div className="desktop-agent-ledger">
      <span>{agentRun.toolCalls.length} tools</span>
      <span>{agentRun.evidence.length} evidence</span>
      <span>{agentRun.patchDecisions.length} decisions</span>
    </div>
  ) : null
);

const SettingsDockPanel = ({
  mode,
  sidecarStatus,
  postgresStatus,
  localStoreStatus
}: {
  mode: DocumentMode;
  sidecarStatus: SidecarStatus;
  postgresStatus: PostgresStatus;
  localStoreStatus: LocalStoreStatus;
}) => (
  <div className="desktop-tool-panel">
    <dl className="desktop-settings-grid">
      <div><dt>Mode</dt><dd>{mode}</dd></div>
      <div><dt>Sidecar</dt><dd>{sidecarStatus.state}</dd></div>
      <div><dt>Postgres</dt><dd>{postgresStatus.state}</dd></div>
      <div><dt>Local Store</dt><dd>{localStoreStatus.state}</dd></div>
      <div className="desktop-settings-wide"><dt>Postgres source</dt><dd>{postgresStatus.source ?? "not selected"}</dd></div>
      <div className="desktop-settings-wide"><dt>Local path</dt><dd>{localStoreStatus.storagePath ?? "not initialized"}</dd></div>
    </dl>
  </div>
);

const useInsightDockController = (activeTool: ActivityTool) => {
  const [dockLayout, setDockLayout] = useState<InsightDockLayout>(initialInsightDockLayout);
  const [dragPreview, setDragPreview] = useState<DockDragPreview | null>(null);
  const activeDockPanel = activityDockPanel[activeTool];

  useEffect(() => {
    setDockLayout((current) => ({
      ...current,
      active: activeDockPanel,
      minimized: current.minimized.filter((panel) => panel !== activeDockPanel),
      order: [activeDockPanel, ...current.order.filter((panel) => panel !== activeDockPanel)]
    }));
  }, [activeDockPanel]);

  const visiblePanels = dockLayout.order.filter((panel) => !dockLayout.minimized.includes(panel));
  const minimizedPanels = dockLayout.order.filter((panel) => dockLayout.minimized.includes(panel));

  const activatePanel = (panel: InsightDockPanelId) => {
    setDockLayout((current) => ({
      ...current,
      active: panel,
      minimized: current.minimized.filter((item) => item !== panel)
    }));
  };

  const minimizePanel = (panel: InsightDockPanelId) => {
    setDockLayout((current) => {
      const minimized = current.minimized.includes(panel)
        ? current.minimized
        : [...current.minimized, panel];
      const nextVisible = current.order.find((item) => item !== panel && !minimized.includes(item));
      return {
        ...current,
        minimized,
        active: current.active === panel ? nextVisible ?? panel : current.active
      };
    });
  };

  const beginDockResize = (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = dockLayout.sizes[panel];
    document.body.dataset.desktopResizePanel = "dock";

    const onMove = (moveEvent: PointerEvent) => {
      const nextHeight = clampDockPanelSize(startHeight + moveEvent.clientY - startY);
      setDockLayout((current) => ({
        ...current,
        sizes: { ...current.sizes, [panel]: nextHeight }
      }));
    };
    const onEnd = () => {
      delete document.body.dataset.desktopResizePanel;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  const beginDockDrag = (panel: InsightDockPanelId, event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    let latestTarget: InsightDockPanelId | null = null;
    document.body.dataset.desktopDockDrag = panel;

    const updatePreview = (clientX: number, clientY: number) => {
      const moved = Math.abs(clientX - startX) + Math.abs(clientY - startY);
      const targetElement = document.elementFromPoint(clientX, clientY);
      const targetPanel = targetElement?.closest("[data-dock-panel]")?.getAttribute("data-dock-panel") as InsightDockPanelId | null;
      const nextTarget = moved >= 8 && targetPanel && targetPanel !== panel && insightDockMeta[targetPanel]
        ? targetPanel
        : null;
      latestTarget = nextTarget;
      setDragPreview(nextTarget ? { source: panel, target: nextTarget } : null);
    };

    const onMove = (moveEvent: PointerEvent) => {
      updatePreview(moveEvent.clientX, moveEvent.clientY);
    };

    const onEnd = (endEvent: PointerEvent) => {
      delete document.body.dataset.desktopDockDrag;
      window.removeEventListener("pointermove", onMove);
      const moved = Math.abs(endEvent.clientX - startX) + Math.abs(endEvent.clientY - startY);
      const targetPanel = latestTarget;
      setDragPreview(null);
      if (moved < 8 || !targetPanel || !insightDockMeta[targetPanel]) return;
      setDockLayout((current) => ({
        ...current,
        active: panel,
        order: moveDockPanel(current.order, panel, targetPanel)
      }));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd, { once: true });
  };

  return {
    dockLayout,
    dragPreview,
    visiblePanels,
    minimizedPanels,
    activatePanel,
    minimizePanel,
    beginDockResize,
    beginDockDrag
  };
};

const InsightDockTabs = ({
  panels,
  onActivate
}: {
  panels: InsightDockPanelId[];
  onActivate: (panel: InsightDockPanelId) => void;
}) => (
  <div className="desktop-dock-tabs" aria-label="Minimized dock panels">
    {panels.map((panel) => {
      const meta = insightDockMeta[panel];
      const Icon = meta.icon;
      return (
        <button key={panel} type="button" onClick={() => onActivate(panel)} title={meta.label}>
          <Icon size={13} />
          <span>{meta.label}</span>
        </button>
      );
    })}
  </div>
);

const InsightDockContent = ({
  panel,
  props
}: {
  panel: InsightDockPanelId;
  props: InsightPaneProps;
}) => {
  const quickFixes = getQuickFixCandidates(props.diagnostics);
  const activeProposal = getLatestPatchProposal(props.agentRun);
  const approvedDecision = findPatchDecision(props.agentRun, activeProposal?.patchProposalId, "approved");
  const rejectedDecision = findPatchDecision(props.agentRun, activeProposal?.patchProposalId, "rejected");
  const appliedDecision = findPatchDecision(props.agentRun, activeProposal?.patchProposalId, "applied");
  const contentByPanel: Record<InsightDockPanelId, ReactNode> = {
    outline: <div className="desktop-insight-section">{props.outline.length > 0 ? <OutlineTree items={props.outline} /> : <p className="desktop-empty-copy">No outline from language service.</p>}</div>,
    preview: <SemanticPreviewPanel preview={props.semanticPreview} workspaceSymbolIndexState={props.workspaceSymbolIndexState} workspaceSymbolIndexMessage={props.workspaceSymbolIndexMessage} workspaceSymbolIndexSummary={props.workspaceSymbolIndexSummary} />,
    rag: <DesktopWorkspaceIndexPanel viewModel={props.workspaceIndexViewModel} connectedRagQueryState={props.workspaceRagQueryState} query={props.workspaceRagQuery} connectedRagOperation={props.workspaceRagQueryOperation} connectedRagOperationMessage={props.workspaceRagQueryMessage} onQueryChange={props.onWorkspaceRagQueryChange} onRunConnectedRagQuery={props.onRunConnectedRagQuery} />,
    graph: <DesktopKnowledgeMapPanel viewModel={props.knowledgeMapViewModel} onSourceJump={props.onKnowledgeMapSourceJump} />,
    runtime: <SidecarControlPanel status={props.sidecarStatus} logTail={props.sidecarLogTail} operation={props.sidecarOperation} message={props.sidecarMessage} errorMessage={props.sidecarError} onStart={props.onStartSidecar} onStop={props.onStopSidecar} onRefresh={props.onRefreshSidecar} onLoadLogs={props.onLoadSidecarLogs} />,
    postgres: <PostgresStatusPanel status={props.postgresStatus} managedStatus={props.managedPostgresStatus} loading={props.postgresLoading} managedOperation={props.managedPostgresOperation} errorMessage={props.postgresError} managedErrorMessage={props.managedPostgresError} managedMessage={props.managedPostgresMessage} profiles={props.postgresProfiles} persistState={props.persistState} persistDisabledReason={props.persistDisabledReason} onRefresh={props.onRefreshPostgres} onInitManaged={props.onInitManagedPostgres} onStartManaged={props.onStartManagedPostgres} onStopManaged={props.onStopManagedPostgres} onMigrateManaged={props.onMigrateManagedPostgres} onRefreshManaged={props.onRefreshManagedPostgres} onPersistGraph={props.onPersistGraph} />,
    storage: <LocalStorePanel status={props.localStoreStatus} operation={props.localStoreOperation} snapshotState={props.localSnapshotState} syncState={props.localSyncState} reactionIntelligenceJobBuild={props.reactionIntelligenceJobBuild} reactionIntelligenceJobState={props.reactionIntelligenceJobState} workspaceIngestState={props.workspaceIngestState} disabledReason={props.localStoreDisabledReason} syncDisabledReason={props.localStoreSyncDisabledReason} workspaceIngestDisabledReason={props.workspaceIngestDisabledReason} errorMessage={props.localStoreError} onRefresh={props.onRefreshLocalStore} onSave={props.onSaveLocalSnapshot} onSync={props.onSyncLocalOutbox} onRunReactionIntelligenceJob={props.onRunReactionIntelligenceJob} onRunWorkspaceIngest={props.onRunWorkspaceIngest} />,
    settings: <SettingsDockPanel mode={props.mode} sidecarStatus={props.sidecarStatus} postgresStatus={props.postgresStatus} localStoreStatus={props.localStoreStatus} />,
    agent: <div className="desktop-agent-panel"><AgentRunHeader agentRun={props.agentRun} agentMessage={props.agentMessage} /><AgentEmptyState mode={props.mode} hasQuickFixes={quickFixes.length > 0} /><AgentQuickFixList mode={props.mode} quickFixes={quickFixes} onProposeQuickFix={props.onProposeQuickFix} /><AgentPatchProposalCard proposal={activeProposal} canApprove={activeProposal !== undefined && approvedDecision === undefined && rejectedDecision === undefined && appliedDecision === undefined} canApply={activeProposal !== undefined && approvedDecision !== undefined && appliedDecision === undefined && rejectedDecision === undefined} canReject={activeProposal !== undefined && rejectedDecision === undefined && appliedDecision === undefined} onApprovePatch={props.onApprovePatch} onApplyPatch={props.onApplyPatch} onRejectPatch={props.onRejectPatch} /><AgentTimeline agentRun={props.agentRun} /><AgentLedger agentRun={props.agentRun} /></div>
  };
  return contentByPanel[panel];
};

const InsightDockFrame = ({
  panel,
  layout,
  props,
  onActivate,
  onMinimize,
  onResize,
  onPointerDragStart
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
    <section
      className="desktop-dock-panel"
      data-dock-panel={panel}
      data-active={layout.active === panel}
      style={{ "--desktop-dock-panel-height": `${layout.sizes[panel]}px` } as CSSProperties}
    >
      <div
        className="desktop-dock-header"
        onClick={() => onActivate(panel)}
        onPointerDown={(event) => onPointerDragStart(panel, event)}
      >
        <GripVertical size={13} />
        <Icon size={14} />
        <div>
          <span>{meta.eyebrow}</span>
          <strong>{meta.label}</strong>
        </div>
        <button type="button" aria-label={`Minimize ${meta.label}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {
          event.stopPropagation();
          onMinimize(panel);
        }}>
          <PanelRightClose size={13} />
        </button>
      </div>
      <div className="desktop-dock-panel-body">
        <InsightDockContent panel={panel} props={props} />
      </div>
      <div className="desktop-dock-splitter" role="separator" aria-label={`${meta.label} split resize`} aria-orientation="horizontal" onPointerDown={(event) => onResize(panel, event)} />
    </section>
  );
};

const InsightDockPreview = ({
  panel,
  layout
}: {
  panel: InsightDockPanelId;
  layout: InsightDockLayout;
}) => {
  const meta = insightDockMeta[panel];
  const Icon = meta.icon;
  return (
    <div
      className="desktop-dock-preview"
      aria-hidden="true"
      style={{ "--desktop-dock-panel-height": `${layout.sizes[panel]}px` } as CSSProperties}
    >
      <GripVertical size={13} />
      <Icon size={14} />
      <span>{meta.label}</span>
    </div>
  );
};

const InsightPane = (props: InsightPaneProps) => {
  const dock = useInsightDockController(props.activeTool);
  const orderedPanels = dock.dragPreview
    ? moveDockPanel(dock.visiblePanels, dock.dragPreview.source, dock.dragPreview.target)
    : dock.visiblePanels;
  return (
    <aside className="desktop-pane desktop-insight-pane" aria-label="Docked tools">
      <InsightDockTabs panels={dock.minimizedPanels} onActivate={dock.activatePanel} />
      <div className="desktop-dock-stack">
        {orderedPanels.map((panel) => (
          dock.dragPreview?.source === panel
            ? <InsightDockPreview key={`preview-${panel}`} panel={panel} layout={dock.dockLayout} />
            : (
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
            )
        ))}
      </div>
    </aside>
  );
};

const BottomPanel = ({ diagnostics, compileStatus, errorMessage }: { diagnostics: ChemdEditorDiagnostic[]; compileStatus: "ok" | "failed"; errorMessage?: string }) => {
  const stats = getDiagnosticStats(diagnostics);
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

const useSidecarController = () => {
  const [status, setStatus] = useState<SidecarStatus>(shellSidecarStatus);
  const [logTail, setLogTail] = useState<string[]>(shellSidecarStatus.logTail);
  const [operation, setOperation] = useState<SidecarOperation | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<SidecarOperation | null>(null);

  useEffect(() => {
    void invokeDesktop("read_sidecar_status", undefined)
      .then((nextStatus) => {
        setStatus(nextStatus);
        setLogTail(nextStatus.logTail);
      })
      .catch((nextError: unknown) => {
        setStatus(shellSidecarStatus);
        setError(getSidecarErrorMessage(nextError));
      });
  }, []);

  const commitStatus = (nextStatus: SidecarStatus, nextMessage: string) => {
    setStatus(nextStatus);
    setLogTail(nextStatus.logTail);
    setMessage(nextMessage);
    setError(null);
  };

  const runLifecycleCommand = async (nextOperation: Exclude<SidecarOperation, "logs">) => {
    if (operationRef.current) return;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    try {
      const command = nextOperation === "start"
        ? "start_sidecar"
        : nextOperation === "stop"
          ? "stop_sidecar"
          : "read_sidecar_status";
      const nextStatus = await invokeDesktop(command, undefined);
      const verb = nextOperation === "start" ? "started" : nextOperation === "stop" ? "stopped" : "refreshed";
      commitStatus(nextStatus, `chem-service ${verb}.`);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const loadLogs = async () => {
    if (operationRef.current) return;
    operationRef.current = "logs";
    setOperation("logs");
    try {
      const nextLogs = await invokeDesktop("read_sidecar_logs", undefined);
      const nextStatus = await invokeDesktop("read_sidecar_status", undefined);
      setStatus(nextStatus);
      setLogTail(nextLogs.lines);
      setMessage(`Loaded ${nextLogs.lines.length} log lines.`);
      setError(null);
    } catch (nextError: unknown) {
      setError(getSidecarErrorMessage(nextError));
      setMessage(null);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  return {
    status,
    logTail,
    operation,
    message,
    error,
    start: () => void runLifecycleCommand("start"),
    stop: () => void runLifecycleCommand("stop"),
    refresh: () => void runLifecycleCommand("refresh"),
    loadLogs: () => void loadLogs()
  };
};

const usePostgresProfileController = (
  onRuntimeStatusChange: () => Promise<void>
): { panel: PostgresProfilePanelController; readProfiles: () => Promise<DesktopCommandMap["list_postgres_profiles"]["output"] | null> } => {
  const [profilesState, setProfilesState] = useState(initialPostgresProfilesState);
  const [profileForm, setProfileForm] = useState(createInitialPostgresProfileForm);
  const [profileOperation, setProfileOperation] = useState<PostgresProfileOperation | null>(null);
  const [profileError, setProfileError] = useState<PostgresProfileCommandError | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const profileOperationRef = useRef<PostgresProfileOperation | null>(null);

  const readProfiles = async () => {
    try {
      const nextProfiles = await invokeDesktop("list_postgres_profiles", undefined);
      setProfilesState(nextProfiles);
      setProfileError(null);
      return nextProfiles;
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("list", nextError, "Postgres profiles unavailable"));
      return null;
    }
  };

  const refreshProfiles = async () => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "list";
    setProfileOperation("list");
    setProfileMessage(null);
    try {
      const nextProfiles = await readProfiles();
      if (nextProfiles) {
        setProfileMessage(`Loaded ${nextProfiles.profiles.length} Postgres profiles.`);
      }
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const saveProfile = async () => {
    if (profileOperationRef.current) return;
    const saveInput = buildPostgresProfileSaveInput(profileForm);
    if (!saveInput.ok) {
      setProfileError(toPostgresProfileValidationError("save", saveInput.message));
      setProfileMessage(null);
      return;
    }
    profileOperationRef.current = "save";
    setProfileOperation("save");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeDesktop("save_postgres_profile", { input: saveInput.input });
      setProfilesState(nextProfiles);
      setProfileForm((current) => clearPostgresProfilePassword(current));
      setProfileError(null);
      setProfileMessage("Postgres profile saved. Password input was cleared.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("save", nextError, "Postgres profile save failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const activateProfile = async (profileId: string) => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "activate";
    setProfileOperation("activate");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeDesktop("activate_postgres_profile", { profileId });
      setProfilesState(nextProfiles);
      setProfileError(null);
      setProfileMessage("Postgres profile activated.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("activate", nextError, "Postgres profile activation failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const deleteProfile = async (profileId: string) => {
    if (profileOperationRef.current) return;
    profileOperationRef.current = "delete";
    setProfileOperation("delete");
    setProfileMessage(null);
    try {
      const nextProfiles = await invokeDesktop("delete_postgres_profile", { profileId });
      setProfilesState(nextProfiles);
      setProfileForm((current) =>
        current.profileId === profileId ? createInitialPostgresProfileForm() : current
      );
      setProfileError(null);
      setProfileMessage("Postgres profile deleted. Active profile state was refreshed.");
      await onRuntimeStatusChange();
    } catch (nextError: unknown) {
      setProfileError(toPostgresProfileCommandError("delete", nextError, "Postgres profile delete failed"));
    } finally {
      profileOperationRef.current = null;
      setProfileOperation(null);
    }
  };

  const editProfile = (profileId: string) => {
    const profile = profilesState.profiles.find((item) => item.profileId === profileId);
    if (!profile) return;
    setProfileForm(createPostgresProfileFormFromProfile(profile));
    setProfileError(null);
    setProfileMessage("Editing saved profile metadata. Saved passwords are never displayed.");
  };

  return {
    readProfiles,
    panel: {
      state: profilesState,
      rows: buildPostgresProfileRows(profilesState),
      form: profileForm,
      operation: profileOperation,
      error: profileError,
      message: profileMessage,
      onFormChange: (patch: Partial<PostgresProfileForm>) => setProfileForm((current) => ({
        ...current,
        ...patch
      })),
      onResetForm: () => {
        setProfileForm(createInitialPostgresProfileForm());
        setProfileError(null);
        setProfileMessage("New Postgres profile form is ready. Password remains empty until entered.");
      },
      onEditProfile: editProfile,
      onSaveProfile: () => void saveProfile(),
      onActivateProfile: (profileId: string) => void activateProfile(profileId),
      onDeleteProfile: (profileId: string) => void deleteProfile(profileId),
      onRefreshProfiles: () => void refreshProfiles()
    }
  };
};

const usePostgresController = () => {
  const [status, setStatus] = useState<PostgresStatus>(shellPostgresStatus);
  const [managedStatus, setManagedStatus] = useState<ManagedPostgresStatus>(initialManagedPostgresStatus);
  const [loading, setLoading] = useState(false);
  const [managedOperation, setManagedOperation] = useState<ManagedPostgresOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managedError, setManagedError] = useState<string | null>(null);
  const [managedMessage, setManagedMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const managedOperationRef = useRef<ManagedPostgresOperation | null>(null);

  const readRuntimeStatus = async () => {
    try {
      const nextStatus = await invokeDesktop("read_postgres_status", undefined);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError: unknown) {
      setStatus(shellPostgresStatus);
      setError(getPostgresErrorMessage(nextError));
    }
  };

  const readManagedStatus = async () => {
    try {
      const nextStatus = await invokeDesktop("read_managed_postgres_status", undefined);
      setManagedStatus(nextStatus);
      setManagedError(null);
    } catch (nextError: unknown) {
      setManagedStatus(initialManagedPostgresStatus);
      setManagedError(getPostgresErrorMessage(nextError));
    }
  };

  const profileController = usePostgresProfileController(readRuntimeStatus);

  const refresh = async () => {
    if (loadingRef.current || managedOperationRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      await readRuntimeStatus();
      await readManagedStatus();
      await profileController.readProfiles();
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  const runManagedCommand = async (operation: ManagedPostgresOperation) => {
    if (loadingRef.current || managedOperationRef.current) return;
    managedOperationRef.current = operation;
    setManagedOperation(operation);
    setManagedMessage(null);
    try {
      const command: keyof Pick<
        DesktopCommandMap,
        "initialize_managed_postgres" | "start_managed_postgres" | "stop_managed_postgres" | "migrate_managed_postgres" | "read_managed_postgres_status"
      > = operation === "init"
        ? "initialize_managed_postgres"
        : operation === "start"
          ? "start_managed_postgres"
          : operation === "stop"
            ? "stop_managed_postgres"
            : operation === "migrate"
              ? "migrate_managed_postgres"
              : "read_managed_postgres_status";
      const nextStatus = await invokeDesktop(command, undefined);
      setManagedStatus(nextStatus);
      setManagedError(null);
      const actionLabel: Record<ManagedPostgresOperation, string> = {
        init: "initialized",
        start: "started",
        stop: "stopped",
        migrate: "migrated",
        refresh: "refreshed"
      };
      setManagedMessage(`Managed Postgres ${actionLabel[operation]}.`);
      await readRuntimeStatus();
    } catch (nextError: unknown) {
      setManagedError(getPostgresErrorMessage(nextError));
    } finally {
      managedOperationRef.current = null;
      setManagedOperation(null);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    managedStatus,
    loading,
    managedOperation,
    error,
    managedError,
    managedMessage,
    profiles: profileController.panel,
    refresh: () => void refresh(),
    initializeManaged: () => void runManagedCommand("init"),
    startManaged: () => void runManagedCommand("start"),
    stopManaged: () => void runManagedCommand("stop"),
    migrateManaged: () => void runManagedCommand("migrate"),
    refreshManaged: () => void runManagedCommand("refresh")
  };
};

const useEmbeddingProviderController = () => {
  const [status, setStatus] = useState<EmbeddingProviderStatus>(initialEmbeddingProviderStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const nextStatus = await invokeDesktop("read_embedding_provider_status", undefined);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError: unknown) {
      setStatus(initialEmbeddingProviderStatus);
      setError(getCommandErrorMessage(nextError, "Embedding provider status unavailable"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    loading,
    error,
    refresh: () => void refresh()
  };
};

const useConnectedRagQueryController = ({
  mode,
  file,
  workspace,
  postgresStatus,
  embeddingStatus,
  localResults
}: {
  mode: DocumentMode;
  file: WorkspaceFileEntry;
  workspace: WorkspaceHandle;
  postgresStatus: PostgresStatus;
  embeddingStatus: EmbeddingProviderStatus;
  localResults: DesktopWorkspaceIndexViewModel["ragResults"];
}) => {
  const [query, setQueryValue] = useState("");
  const [operation, setOperation] = useState<RagQueryOperationState>("idle");
  const [message, setMessage] = useState("Connected RAG needs a configured embedding provider before it can query Postgres.");
  const [commandResult, setCommandResult] = useState<PostgresRagQueryResult | null>(null);
  const [embeddingResult, setEmbeddingResult] = useState<{
    query: string;
    result: CreateEmbeddingVectorResult;
  } | null>(null);
  const normalizedQuery = query.trim();
  const activeEmbeddingResult = embeddingResult?.query === normalizedQuery
    ? embeddingResult.result
    : null;
  const queryState = useMemo(() => buildDesktopPostgresRagQueryControllerState({
    mode,
    query,
    postgresStatus,
    embedding: {
      providerAvailable: embeddingStatus.state === "ready",
      vector: activeEmbeddingResult?.state === "ready" ? activeEmbeddingResult.embedding : null,
      model: activeEmbeddingResult?.model ?? embeddingStatus.model,
      distanceMetric: embeddingStatus.distanceMetric ?? undefined
    },
    runnerAvailable: true,
    localResults,
    commandResult,
    workspaceId: workspace.workspaceId,
    documentId: file.path,
    limit: 8
  }), [activeEmbeddingResult, commandResult, embeddingStatus, file.path, localResults, mode, postgresStatus, query, workspace.workspaceId]);

  useEffect(() => {
    setCommandResult(null);
    setEmbeddingResult(null);
    setOperation(normalizedQuery ? "idle" : "disabled");
    setMessage(normalizedQuery
      ? queryState.message
      : "Enter a query to search connected RAG when an embedding vector is available.");
  }, [embeddingStatus, file.id, mode, postgresStatus, query, workspace.workspaceId]);

  const setQuery = (nextQuery: string) => {
    setQueryValue(nextQuery);
  };

  const run = async () => {
    if (operation === "pending") return;
    if (queryState.readiness.disabled) {
      setOperation("disabled");
      setMessage(queryState.message);
      return;
    }
    const queryText = queryState.query;
    setOperation("pending");
    setMessage("Creating query embedding vector.");
    try {
      const embedding = await invokeDesktop("create_embedding_vector", {
        input: { text: queryText }
      });
      setEmbeddingResult({ query: queryText, result: embedding });
      if (embedding.state !== "ready" || embedding.embedding.length === 0 || !embedding.model) {
        setOperation("failure");
        setMessage(embedding.detail || "Embedding provider did not return a usable vector.");
        return;
      }
      const readyState = buildDesktopPostgresRagQueryControllerState({
        mode,
        query: queryText,
        postgresStatus,
        embedding: {
          providerAvailable: true,
          vector: embedding.embedding,
          model: embedding.model,
          distanceMetric: embeddingStatus.distanceMetric ?? undefined
        },
        runnerAvailable: true,
        localResults,
        commandResult: null,
        workspaceId: workspace.workspaceId,
        documentId: file.path,
        limit: 8
      });
      if (!readyState.request) {
        setOperation("failure");
        setMessage(readyState.message);
        return;
      }
      setMessage("Querying connected Postgres RAG.");
      const result = await invokeDesktop("query_postgres_rag", { input: readyState.request });
      setCommandResult(result);
      setOperation(result.state === "ready" ? "success" : "failure");
      setMessage(result.detail || readyState.message);
    } catch (error: unknown) {
      setOperation("failure");
      setMessage(getCommandErrorMessage(error, "Connected RAG query failed"));
    }
  };

  return {
    query,
    state: queryState,
    operation,
    message,
    setQuery,
    run: () => void run()
  };
};

const usePersistRuntimeController = ({
  mode,
  file,
  postgresStatus,
  source,
  workspace,
  compileOutput,
  agentRun
}: PersistControllerInput) => {
  const [state, setState] = useState<PersistState>(initialPersistState);
  const disabledReason = getPersistDisabledReason({
    mode,
    file,
    postgresStatus,
    compileStatus: compileOutput.status
  });

  useEffect(() => {
    setState(initialPersistState);
  }, [mode, file.id]);

  const reset = () => setState(initialPersistState);
  const persist = async () => {
    if (disabledReason !== null || compileOutput.status === "failed") {
      setState({ state: "failure", message: disabledReason ?? "Compile failed.", summary: null });
      return;
    }
    setState({ state: "pending", message: "Persisting Graph/RAG payload to Postgres.", summary: null });
    try {
      const input = buildPersistCommandInput({ source, workspace, file, compileOutput, agentRun });
      const result = await invokeDesktop("persist_runtime_graph_rag", input);
      setState({
        state: "success",
        message: result.detail || "Persisted Graph/RAG payload.",
        summary: { graphSnapshotId: result.graphSnapshotId, counts: result.counts }
      });
    } catch (error: unknown) {
      setState({ state: "failure", message: getPersistErrorMessage(error), summary: null });
    }
  };

  return {
    state,
    disabledReason,
    reset,
    persist: () => void persist()
  };
};

const useLocalStoreController = ({
  mode,
  file,
  postgresStatus,
  source,
  workspace,
  compileOutput,
  agentRun
}: LocalStoreControllerInput) => {
  const [status, setStatus] = useState<LocalStoreStatus>(initialLocalStoreStatus);
  const [snapshotState, setSnapshotState] = useState<LocalSnapshotState>(initialLocalSnapshotState);
  const [syncState, setSyncState] = useState<LocalSyncState>(initialLocalSyncState);
  const [reactionIntelligenceArtifactState, setReactionIntelligenceArtifactState] =
    useState<LocalReactionIntelligenceArtifactState>(initialLocalReactionIntelligenceArtifactState);
  const [operation, setOperation] = useState<LocalStoreOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const operationRef = useRef<LocalStoreOperation | null>(null);
  const disabledReason = getLocalSnapshotDisabledReason({
    mode,
    file,
    compileStatus: compileOutput.status
  });
  const syncDisabledReason = getLocalSyncDisabledReason({
    localStoreStatus: status,
    postgresStatus
  });

  const readStatus = async (): Promise<LocalStoreStatus | null> => {
    try {
      const nextStatus = await invokeDesktop("read_local_store_status", undefined);
      setStatus(nextStatus);
      setError(null);
      return nextStatus;
    } catch (nextError: unknown) {
      setStatus(initialLocalStoreStatus);
      setError(getLocalStoreErrorMessage(nextError));
      return null;
    }
  };

  const readReactionIntelligenceArtifact = async (): Promise<LocalReactionIntelligenceArtifactState> => {
    const nextState = await readLatestLocalReactionIntelligenceArtifact({
      listArtifacts: (input) => invokeDesktop("list_local_reaction_intelligence_artifacts", input)
    });
    setReactionIntelligenceArtifactState(nextState);
    return nextState;
  };

  const refresh = async () => {
    if (operationRef.current) return;
    operationRef.current = "refresh";
    setOperation("refresh");
    try {
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const saveSnapshot = async () => {
    if (operationRef.current) return;
    if (disabledReason !== null || compileOutput.status === "failed") {
      setSnapshotState({ state: "failure", message: disabledReason ?? "Compile failed.", summary: null });
      return;
    }
    operationRef.current = "save";
    setOperation("save");
    setSnapshotState({ state: "pending", message: "Saving Graph/RAG/Agent snapshot to the local JSON outbox.", summary: null });
    try {
      const persistInput = buildPersistCommandInput({ source, workspace, file, compileOutput, agentRun });
      const localInput = buildLocalRuntimeSnapshotInput(persistInput.payload);
      const result = await invokeDesktop("save_local_runtime_snapshot", localInput);
      setSnapshotState({
        state: "success",
        message: "Saved local snapshot. It is pending Postgres sync until a target reconnects.",
        summary: {
          localId: result.localId,
          idempotencyKey: result.idempotencyKey,
          pendingCount: result.outboxPendingCount
        }
      });
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } catch (nextError: unknown) {
      setSnapshotState({ state: "failure", message: getLocalStoreErrorMessage(nextError), summary: null });
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  const syncPending = async () => {
    if (operationRef.current) return;
    if (syncDisabledReason !== null) {
      setSyncState({ state: "failure", message: syncDisabledReason, summary: null });
      return;
    }
    operationRef.current = "sync";
    setOperation("sync");
    setSyncState({ state: "pending", message: "Syncing pending Local Store entries to Postgres.", summary: null });
    try {
      const result = await invokeDesktop("sync_local_outbox_to_postgres", undefined);
      const failedEntries = result.entries.filter((entry) => entry.syncStatus === "failed" || entry.error !== undefined);
      setSyncState({
        state: result.failedCount > 0 ? "failure" : "success",
        message: result.detail || (result.failedCount > 0
          ? "Sync finished with failed entries. Local failures remain visible in the outbox."
          : "Synced pending Local Store entries to Postgres."),
        summary: {
          syncedCount: result.syncedCount,
          failedCount: result.failedCount,
          skippedCount: result.skippedCount,
          target: result.target,
          failedEntries
        }
      });
      await Promise.all([readStatus(), readReactionIntelligenceArtifact()]);
    } catch (nextError: unknown) {
      setSyncState({ state: "failure", message: getLocalStoreErrorMessage(nextError), summary: null });
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  };

  useEffect(() => {
    setSnapshotState(initialLocalSnapshotState);
    setSyncState(initialLocalSyncState);
  }, [mode, file.id]);

  useEffect(() => {
    void refresh();
  }, []);

  return {
    status,
    snapshotState,
    syncState,
    reactionIntelligenceArtifactState,
    operation,
    disabledReason,
    syncDisabledReason,
    error: error ?? reactionIntelligenceArtifactState.error,
    reset: () => {
      setSnapshotState(initialLocalSnapshotState);
      setSyncState(initialLocalSyncState);
    },
    refresh: () => void refresh(),
    saveSnapshot: () => void saveSnapshot(),
    syncPending: () => void syncPending()
  };
};

const useReactionIntelligenceJobController = ({
  mode,
  file,
  jobBuild,
  onAfterRun
}: ReactionIntelligenceJobControllerInput) => {
  const controllerRef = useRef<DesktopReactionIntelligenceJobController | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDesktopReactionIntelligenceJobController({
      runWorker: async (input) => {
        const result = await invokeDesktop("run_reaction_intelligence_worker", {
          jobJson: input.job,
          providers: input.job.requested_providers,
          missingDependency: input.job.provider_policy.missing_dependency,
          pretty: false
        });
        return toDesktopReactionIntelligenceWorkerResult(result);
      },
      saveArtifact: (input) => invokeDesktop("save_local_reaction_intelligence_artifact", input),
      readLatestArtifact: (input) => readLatestLocalReactionIntelligenceArtifact({
        listArtifacts: (listInput) => invokeDesktop("list_local_reaction_intelligence_artifacts", listInput),
        graphIndexId: input.graphIndexId
      }),
      now: () => new Date().toISOString()
    });
  }

  const [state, setState] = useState(() => controllerRef.current!.getState());

  useEffect(() => {
    const nextState = controllerRef.current?.reset();
    if (nextState) setState(nextState);
  }, [mode, file.id]);

  const run = async () => {
    const nextState = await controllerRef.current?.run({
      job: jobBuild.job,
      workspaceId: file.id,
      sourceHash: jobBuild.job?.source_compile_run_ids[0] ?? null,
      graphIndexId: jobBuild.job?.graph_index_id ?? null
    });
    if (!nextState || !controllerRef.current) return;
    setState(controllerRef.current.getState());
    if (nextState.status === "completed") {
      onAfterRun();
    }
  };

  return {
    state,
    run: () => void run()
  };
};

const useWorkspaceIngestController = ({
  mode,
  workspaceState,
  workspace,
  files,
  onAfterRun
}: WorkspaceIngestControllerInput) => {
  const [state, setState] = useState<WorkspaceIngestState>(initialWorkspaceIngestState);
  const runningRef = useRef(false);
  const disabledReason = getWorkspaceIngestDisabledReason({ mode, workspaceState, files });

  useEffect(() => {
    setState(initialWorkspaceIngestState);
  }, [mode, workspace.workspaceId]);

  const runIngest = async () => {
    if (runningRef.current) return;
    if (disabledReason !== null) {
      setState({ ...initialWorkspaceIngestState, state: "failure", message: disabledReason });
      return;
    }
    runningRef.current = true;
    setState((current) => ({
      ...current,
      state: "pending",
      message: "Scanning workspace files and saving eligible Chemd snapshots to the Local Store outbox."
    }));
    try {
      const result = await runWorkspaceIngestOutboxSave({
        workspaceId: workspace.workspaceId,
        files,
        existingItems: state.items,
        readFile: (file) => invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        }),
        compile: (source, file) => {
          const output = compileChemdForEditor({
            source,
            documentUri: file.path,
            options: { strictChemdKind: true, procedureMode: "auto" }
          });
          if (output.status === "failed") throw output.error;
          return {
            compileOutput: output,
            runtimePayload: buildPersistCommandInput({
              source,
              workspace,
              file,
              compileOutput: output,
              agentRun: null
            }).payload
          };
        },
        saveSnapshot: (input) => {
          return invokeDesktop("save_local_runtime_snapshot", input);
        }
      });
      setState({
        state: "success",
        message: `Workspace ingest scan finished: ${formatWorkspaceIngestCounts(result.ingest.summary)}. ${result.message}`,
        items: result.ingest.items,
        summary: result.ingest.summary
      });
      onAfterRun?.();
    } catch (error: unknown) {
      setState((current) => ({
        ...current,
        state: "failure",
        message: getCommandErrorMessage(error, "Workspace ingest failed before queue summary was built.")
      }));
    } finally {
      runningRef.current = false;
    }
  };

  return {
    state,
    disabledReason,
    runIngest: () => void runIngest()
  };
};

const formatWorkspaceSymbolIndexMessage = (
  summary: DesktopWorkspaceSymbolIndexSummary
): string =>
  `Workspace symbols indexed: ${summary.indexedFiles} ready, ${summary.failedFiles} failed, ${summary.skippedFiles} skipped.`;

const useWorkspaceSymbolIndexController = ({
  mode,
  workspaceState,
  workspace,
  files,
  selectedFile,
  source
}: WorkspaceSymbolIndexControllerInput): WorkspaceSymbolIndexControllerState => {
  const [state, setState] = useState<WorkspaceSymbolIndexControllerState>(
    initialWorkspaceSymbolIndexState
  );

  useEffect(() => {
    if (mode !== "workspace" || workspaceState !== "open") {
      setState(initialWorkspaceSymbolIndexState);
      return;
    }

    let cancelled = false;
    setState((current) => ({
      ...current,
      state: "pending",
      message: "Building workspace symbol index from local Chemd documents."
    }));

    void buildDesktopWorkspaceSymbolIndex({
      workspace,
      files,
      createDocumentUri: (file) => toChemdDesktopModelUri(file.path),
      readFile: async (file) => {
        if (file.id === selectedFile.id || file.path === selectedFile.path) {
          return source;
        }

        const content = await invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        });
        return content.content;
      }
    }).then((result) => {
      if (cancelled) return;
      setState({
        state: "success",
        message: formatWorkspaceSymbolIndexMessage(result.summary),
        index: result.index,
        summary: result.summary
      });
    }).catch((error: unknown) => {
      if (cancelled) return;
      setState({
        state: "failure",
        message: getCommandErrorMessage(
          error,
          "Workspace symbol index failed before cross-document suggestions were built."
        ),
        index: null,
        summary: null
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    files,
    mode,
    selectedFile.id,
    selectedFile.path,
    source,
    workspace,
    workspaceState
  ]);

  return state;
};

const useAgentPatchController = ({
  agentRun,
  setAgentRun,
  setAgentMessage,
  mode,
  file,
  workspace,
  source,
  onSourceChange
}: AgentPatchControllerInput) => {
  useEffect(() => {
    setAgentRun(null);
    setAgentMessage(null);
  }, [file.id, mode, setAgentMessage, setAgentRun]);

  const proposeQuickFix = (candidate: QuickFixCandidate) => {
    if (mode !== "workspace" || file.kind !== "file") {
      setAgentMessage({
        tone: "warning",
        text: "Open a local workspace file before creating an Agent patch proposal."
      });
      return;
    }

    const result = createAgentProposalRun(candidate, file, workspace.workspaceId);
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const approvePatch = () => {
    const result = agentRun ? approveAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const applyPatch = () => {
    const operation = agentRun ? applyAgentRunPatch(agentRun, source) : null;
    if (!operation) return;
    if (operation.nextSource !== undefined) onSourceChange(operation.nextSource);
    setAgentRun(operation.result.run);
    setAgentMessage(operation.result.message);
  };

  const rejectPatch = () => {
    const result = agentRun ? rejectAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  return { proposeQuickFix, approvePatch, applyPatch, rejectPatch };
};

const DesktopWorkbench = ({
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
  onProposeQuickFix,
  onApprovePatch,
  onApplyPatch,
  onRejectPatch
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
    <main className="desktop-shell">
      <TopBar workspace={workspace} workspaceState={workspaceState} sidecarStatus={sidecarController.status} postgresStatus={postgresController.status} diagnosticCount={output.diagnostics.length} dirty={source !== savedSource} rootPath={rootPath} canSave={canSave} onRootPathChange={onRootPathChange} onSave={onSave} onOpenWorkspace={onOpenWorkspace} />
      <div className="desktop-workbench" style={layoutController.style} data-sidebar-collapsed={layout.sidebarCollapsed}>
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
        <div className="desktop-main-grid" data-insight-collapsed={layout.insightCollapsed} data-bottom-collapsed={layout.bottomCollapsed}>
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
              knowledgeMapViewModel={knowledgeMapViewModel}
              mode={mode}
              sidecarStatus={sidecarController.status} sidecarLogTail={sidecarController.logTail} sidecarOperation={sidecarController.operation} sidecarMessage={sidecarController.message} sidecarError={sidecarController.error}
              postgresStatus={postgresController.status} managedPostgresStatus={postgresController.managedStatus} postgresLoading={postgresController.loading} managedPostgresOperation={postgresController.managedOperation} postgresError={postgresController.error} managedPostgresError={postgresController.managedError} managedPostgresMessage={postgresController.managedMessage} postgresProfiles={postgresController.profiles}
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
              workspaceSymbolIndexSummary={workspaceSymbolIndexController.summary} workspaceSymbolIndexState={workspaceSymbolIndexController.state} workspaceSymbolIndexMessage={workspaceSymbolIndexController.message} semanticPreview={semanticPreview}
              agentRun={agentRun}
              agentMessage={agentMessage}
              onStartSidecar={sidecarController.start} onStopSidecar={sidecarController.stop} onRefreshSidecar={sidecarController.refresh} onLoadSidecarLogs={sidecarController.loadLogs}
              onRefreshPostgres={postgresController.refresh}
              onInitManagedPostgres={postgresController.initializeManaged}
              onStartManagedPostgres={postgresController.startManaged}
              onStopManagedPostgres={postgresController.stopManaged}
              onMigrateManagedPostgres={postgresController.migrateManaged}
              onRefreshManagedPostgres={postgresController.refreshManaged}
              onPersistGraph={persistController.persist}
              onWorkspaceRagQueryChange={onWorkspaceRagQueryChange}
              onRunConnectedRagQuery={onRunConnectedRagQuery}
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
          {layout.bottomCollapsed ? null : <BottomPanel diagnostics={output.diagnostics} compileStatus={output.status} errorMessage={compileError} />}
        </div>
      </div>
    </main>
  );
};

const useWorkspaceFileController = () => {
  const initialSource = sampleSources["suzuki-screen.chemd.md"];
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>("empty");
  const [workspace, setWorkspace] = useState<WorkspaceHandle>(shellWorkspace);
  const [files, setFiles] = useState<WorkspaceFileEntry[]>(shellFiles);
  const [selectedFileId, setSelectedFileId] = useState(shellFiles[0].id);
  const [source, setSource] = useState(initialSource);
  const [savedSource, setSavedSource] = useState(initialSource);
  const [savedContentHash, setSavedContentHash] = useState<string | null>(null);
  const [workspaceConflict, setWorkspaceConflict] = useState<WorkspaceConflictState | null>(null);
  const [mode, setMode] = useState<DocumentMode>("sample");
  const [rootPath, setRootPath] = useState("");
  const [message, setMessage] = useState("No workspace is open. Editing bundled sample content.");
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? shellFiles[0];
  const canSave = mode === "workspace" && selectedFile.kind === "file" && source !== savedSource && workspace.writable;

  const openWorkspace = async () => {
    setWorkspaceState("opening");
    try {
      const nextWorkspace = await invokeDesktop("open_workspace", { rootPath: rootPath.trim() });
      const nextFiles = await invokeDesktop("list_workspace_files", { workspaceId: nextWorkspace.workspaceId });
      const usableFiles = nextFiles.length > 0 ? nextFiles : shellFiles;
      const firstFile = usableFiles.find((file) => file.kind === "file") ?? usableFiles[0];
      const nextContent = firstFile.kind === "file"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: nextWorkspace.workspaceId,
          path: firstFile.path
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(firstFile);
      const nextContentHash = nextContent?.contentHash ?? null;
      setWorkspace(nextWorkspace);
      setFiles(usableFiles);
      setSelectedFileId(firstFile.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setSavedContentHash(nextContentHash);
      setWorkspaceConflict(null);
      setRootPath(nextWorkspace.rootPath);
      setMode("workspace");
      setMessage(`Opened ${usableFiles.length} visible Markdown entries from the local workspace.`);
      setWorkspaceState("open");
    } catch (error: unknown) {
      setWorkspace(shellWorkspace);
      setFiles(shellFiles);
      setMode("sample");
      setMessage(`Workspace open failed: ${getDisplayableError(error)}. Using bundled sample content.`);
      setWorkspaceState("error");
    }
  };

  const selectFile = async (file: WorkspaceFileEntry) => {
    if (file.kind !== "file") return;
    try {
      const nextContent = mode === "workspace"
        ? await invokeDesktop("read_workspace_file", {
          workspaceId: workspace.workspaceId,
          path: file.path
        })
        : undefined;
      const nextSource = nextContent?.content ?? getSampleSource(file);
      setSelectedFileId(file.id);
      setSource(nextSource);
      setSavedSource(nextSource);
      setSavedContentHash(nextContent?.contentHash ?? null);
      setWorkspaceConflict(null);
      setMessage(mode === "sample" ? "Sample document selected from bundled fallback." : `Read ${file.path} from the local workspace.`);
    } catch (error: unknown) {
      setMessage(`Workspace read failed: ${getDisplayableError(error)}.`);
    }
  };

  const reloadWorkspaceConflict = async () => {
    if (!workspaceConflict || mode !== "workspace" || selectedFile.kind !== "file") return;
    setWorkspaceConflict((current) => current ? { ...current, reloading: true } : current);
    try {
      const nextContent = await invokeDesktop("read_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path
      });
      setSource(nextContent.content);
      setSavedSource(nextContent.content);
      setSavedContentHash(nextContent.contentHash);
      setWorkspaceConflict(null);
      setMessage(`Reloaded ${nextContent.path} from disk.`);
    } catch (error: unknown) {
      const nextMessage = `Reload failed: ${getDisplayableError(error)}. Local edits are still in the editor.`;
      setWorkspaceConflict((current) => current
        ? { ...current, message: nextMessage, reloading: false }
        : current);
      setMessage(nextMessage);
    }
  };

  const keepLocalWorkspaceConflict = () => {
    if (!workspaceConflict) return;
    setWorkspaceConflict(null);
    setMessage("Kept local editor changes. Save remains guarded by the last saved file hash.");
  };

  const saveWorkspaceFile = async () => {
    if (!canSave) return;
    try {
      const result = await invokeDesktop("write_workspace_file", {
        workspaceId: workspace.workspaceId,
        path: selectedFile.path,
        content: source,
        baseHash: savedContentHash ?? undefined
      });
      setSavedSource(source);
      setSavedContentHash(result.contentHash);
      setWorkspaceConflict(null);
      setMessage(`Saved ${result.path} (${result.bytes} bytes).`);
    } catch (error: unknown) {
      if (getCommandErrorCode(error) === "workspace_file_conflict") {
        setWorkspaceConflict({
          path: selectedFile.path,
          message: "The file changed on disk after this buffer was loaded. Reload from disk or keep editing the local buffer.",
          detectedAt: new Date().toISOString(),
          reloading: false
        });
        setMessage("Workspace save conflict. Local editor content was not overwritten.");
        return;
      }
      setMessage(`Workspace save failed: ${getDisplayableError(error)}.`);
    }
  };

  return {
    workspaceState,
    workspace,
    files,
    selectedFile,
    selectedFileId,
    source,
    savedSource,
    workspaceConflict,
    mode,
    rootPath,
    message,
    canSave,
    setRootPath,
    setSource,
    setMessage,
    openWorkspace,
    selectFile,
    saveWorkspaceFile,
    reloadWorkspaceConflict,
    keepLocalWorkspaceConflict
  };
};

export const App = () => {
  const workspaceController = useWorkspaceFileController();
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);
  const editorRef = useRef<MonacoChemdEditorHandle | null>(null);
  const sidecarController = useSidecarController();
  const postgresController = usePostgresController();
  const readWorkspaceIndexFile = useCallback((file: WorkspaceFileEntry) =>
    invokeDesktop("read_workspace_file", {
      workspaceId: workspaceController.workspace.workspaceId,
      path: file.path
    }).then((result) => ({
      content: result.content,
      modifiedAtMs: result.modifiedAtMs
    })),
  [workspaceController.workspace.workspaceId]);
  const output = useMemo(() => compileChemdForEditor({
    source: workspaceController.source,
    documentUri: workspaceController.selectedFile.path,
    options: { strictChemdKind: true, procedureMode: "auto" }
  }), [workspaceController.selectedFile.path, workspaceController.source]);
  const outputReactionIds = useMemo(() =>
    output.status === "ok"
      ? output.symbols
        .filter((symbol) => symbol.kind === "reaction")
        .map((symbol) => symbol.id)
      : [],
  [output]);
  const semanticPreview = useMemo(
    () => buildDesktopSemanticPreview(output),
    [output]
  );
  const workspaceIndexController = useDesktopWorkspaceIndexController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    selectedFile: workspaceController.selectedFile,
    source: workspaceController.source,
    readFile: readWorkspaceIndexFile
  });
  const workspaceIndexViewModel = workspaceIndexController.viewModel;
  const embeddingProviderController = useEmbeddingProviderController();
  const connectedRagQueryController = useConnectedRagQueryController({
    mode: workspaceController.mode,
    postgresStatus: postgresController.status,
    embeddingStatus: embeddingProviderController.status,
    localResults: workspaceIndexViewModel.ragResults,
    file: workspaceController.selectedFile,
    workspace: workspaceController.workspace
  });
  const workspaceRagQueryState = connectedRagQueryController.state;
  const compileError = output.status === "failed" ? output.error.message : undefined;
  const persistController = usePersistRuntimeController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    postgresStatus: postgresController.status,
    source: workspaceController.source,
    workspace: workspaceController.workspace,
    compileOutput: output,
    agentRun
  });
  const localStoreController = useLocalStoreController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    postgresStatus: postgresController.status,
    source: workspaceController.source,
    workspace: workspaceController.workspace,
    compileOutput: output,
    agentRun
  });
  const reactionIntelligenceJobBuild = useMemo(() =>
    buildDesktopReactionIntelligenceJob({
      compileOutput: output,
      source: workspaceController.source,
      documentUri: workspaceController.selectedFile.path
    }),
  [output, workspaceController.selectedFile.path, workspaceController.source]);
  const reactionIntelligenceJobController = useReactionIntelligenceJobController({
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    jobBuild: reactionIntelligenceJobBuild,
    onAfterRun: localStoreController.refresh
  });
  const localReactionIntelligenceArtifact = useMemo(() => {
    const artifact = localStoreController.reactionIntelligenceArtifactState.artifact;
    return reactionIntelligenceArtifactHasReactionOverlap(artifact, outputReactionIds)
      ? artifact
      : null;
  }, [localStoreController.reactionIntelligenceArtifactState.artifact, outputReactionIds]);
  const knowledgeMapViewModel = useMemo(() =>
    buildDesktopKnowledgeMapViewModel(output, {
      reactionIntelligenceArtifact: localReactionIntelligenceArtifact
    }),
  [localReactionIntelligenceArtifact, output]);
  const workspaceIngestController = useWorkspaceIngestController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    onAfterRun: localStoreController.refresh
  });
  const workspaceSymbolIndexController = useWorkspaceSymbolIndexController({
    mode: workspaceController.mode,
    workspaceState: workspaceController.workspaceState,
    workspace: workspaceController.workspace,
    files: workspaceController.files,
    selectedFile: workspaceController.selectedFile,
    source: workspaceController.source
  });

  const updateEditorSource = (nextSource: string) => {
    workspaceController.setSource(nextSource);
    persistController.reset();
    localStoreController.reset();
  };

  const handleKnowledgeMapSourceJump = useCallback((intent: DesktopSourceJumpIntent) => {
    const currentPath = workspaceController.selectedFile.path;
    if (!isSameChemdDesktopDocumentPath(intent.sourceUri, currentPath)) {
      workspaceController.setMessage(
        `Source ref points to ${intent.sourceUri}; current phase only jumps within ${currentPath}.`
      );
      return;
    }

    const jumped = editorRef.current?.jumpToSource(intent) ?? false;
    if (!jumped) {
      workspaceController.setMessage("Source ref jump is unavailable until Monaco editor is mounted.");
      return;
    }

    workspaceController.setMessage(
      `Jumped to ${currentPath} L${intent.range.startLine}-L${intent.range.endLine}.`
    );
  }, [workspaceController]);

  const agentPatchController = useAgentPatchController({
    agentRun,
    setAgentRun,
    setAgentMessage,
    mode: workspaceController.mode,
    file: workspaceController.selectedFile,
    workspace: workspaceController.workspace,
    source: workspaceController.source,
    onSourceChange: updateEditorSource
  });

  return (
    <DesktopWorkbench
      workspace={workspaceController.workspace} workspaceState={workspaceController.workspaceState}
      sidecarController={sidecarController} postgresController={postgresController} persistController={persistController} localStoreController={localStoreController} reactionIntelligenceJobBuild={reactionIntelligenceJobBuild} reactionIntelligenceJobController={reactionIntelligenceJobController} workspaceIngestController={workspaceIngestController} workspaceSymbolIndexController={workspaceSymbolIndexController}
      semanticPreview={semanticPreview}
      workspaceIndexViewModel={workspaceIndexViewModel} workspaceRagQueryState={workspaceRagQueryState} workspaceRagQuery={connectedRagQueryController.query} workspaceRagQueryOperation={connectedRagQueryController.operation} workspaceRagQueryMessage={connectedRagQueryController.message} knowledgeMapViewModel={knowledgeMapViewModel}
      output={output} compileError={compileError}
      files={workspaceController.files} selectedFile={workspaceController.selectedFile} selectedFileId={workspaceController.selectedFileId}
      mode={workspaceController.mode} message={workspaceController.message} source={workspaceController.source} savedSource={workspaceController.savedSource} workspaceConflict={workspaceController.workspaceConflict}
      rootPath={workspaceController.rootPath} canSave={workspaceController.canSave} agentRun={agentRun} agentMessage={agentMessage}
      editorRef={editorRef}
      onRootPathChange={workspaceController.setRootPath} onSourceChange={updateEditorSource}
      onSave={() => void workspaceController.saveWorkspaceFile()} onOpenWorkspace={() => void workspaceController.openWorkspace()}
      onSelectFile={(file) => void workspaceController.selectFile(file)}
      onReloadWorkspaceConflict={() => void workspaceController.reloadWorkspaceConflict()}
      onKeepLocalWorkspaceConflict={workspaceController.keepLocalWorkspaceConflict}
      onKnowledgeMapSourceJump={handleKnowledgeMapSourceJump}
      onWorkspaceRagQueryChange={connectedRagQueryController.setQuery}
      onRunConnectedRagQuery={connectedRagQueryController.run}
      onProposeQuickFix={agentPatchController.proposeQuickFix}
      onApprovePatch={agentPatchController.approvePatch} onApplyPatch={agentPatchController.applyPatch} onRejectPatch={agentPatchController.rejectPatch}
    />
  );
};
