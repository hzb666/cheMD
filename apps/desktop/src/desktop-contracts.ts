import type {
  ChemdReactionIntelligenceArtifactV1,
  ChemdReactionIntelligenceJobInputV1,
  ChemdReactionIntelligenceMissingDependencyPolicyV1,
  ChemdReactionIntelligenceProviderKindV1
} from "@chemd/reaction-map";

export type RuntimeState = "ready" | "placeholder" | "degraded" | "offline";
export type PostgresMigrationReadiness = "ready" | "pending" | "failed" | "unknown";

export interface WorkspaceHandle {
  workspaceId: string;
  displayName: string;
  rootPath: string;
  rootHint: string;
  writable: boolean;
}

export interface WorkspaceFileEntry {
  id: string;
  name: string;
  path: string;
  kind: "file" | "directory";
  chemdKind?: "document" | "asset" | "unknown";
}

export interface SidecarStatus {
  state: RuntimeState;
  label: string;
  detail: string;
  pid: number | null;
  startedAt: string | null;
  logTail: string[];
}

export interface SidecarLogs {
  lines: string[];
}

export interface PostgresStatus {
  state: RuntimeState;
  label: string;
  detail: string;
  configured: boolean;
  source: string | null;
  host: string | null;
  database: string | null;
  user: string | null;
  ssl: string;
  vectorInstalled: boolean | null;
  schemaReady: boolean | null;
  migrationState: PostgresMigrationReadiness;
  migrationReason: string;
  coreTablesFound: number | null;
  timeoutMs: number;
  pool: string | null;
}

export interface PostgresTargetSummary {
  source: string; host: string | null; database: string | null; user: string | null;
  ssl: string; timeoutMs: number; pool: string | null;
}

export interface SavePostgresProfileInput {
  profileId?: string;
  label: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  sslmode?: string;
  timeoutMs?: number;
  pool?: string;
  setActive?: boolean;
}

export interface PostgresProfileSummary {
  profileId: string;
  label: string;
  host: string;
  port: number;
  database: string;
  user: string;
  sslmode: string;
  timeoutMs: number;
  pool: string | null;
  passwordSaved: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PostgresProfilesState {
  activeProfileId: string | null;
  profiles: PostgresProfileSummary[];
}

export type ManagedPostgresMigrationState = "not_initialized" | "pending" | "applied" | "failed";

export interface ManagedPostgresStatus {
  state: RuntimeState;
  label: string;
  detail: string;
  available: boolean;
  reason: string | null;
  configured: boolean;
  source: string | null;
  dataDir: string | null;
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
  pid: number | null;
  startedAt: string | null;
  migrationState: ManagedPostgresMigrationState;
}

export interface RuntimeGraphSourceRange {
  start?: number; end?: number; startLine?: number; startColumn?: number; endLine?: number; endColumn?: number;
}

export type RuntimeJsonPrimitive = string | number | boolean | null;
export type RuntimeJsonValue = RuntimeJsonPrimitive | RuntimeJsonValue[] | { [key: string]: RuntimeJsonValue };
export type RuntimeJsonObject = { [key: string]: RuntimeJsonValue };
export type RuntimeGraphEdgeType = "route_prev" | "route_next" | "same_family" | "same_condition_signature" | "same_substrate" | "same_product" | "campaign_trajectory" | "semantic_similarity" | "evidence_link" | "document_order" | "block_contains_entity" | "diagnostic_evidence";
export type RuntimeAgentRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "created" | "waiting_for_approval" | "applying_patch" | "validating" | "completed" | "blocked" | "canceled";
export type RuntimeAgentToolCallStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "ok" | "blocked";

export interface RuntimeGraphSnapshotRecord {
  graphSnapshotId: string;
  experimentId: string;
  sourceRevisionIds: string[];
  graphKind: "reaction" | "rag_context" | "agent_audit";
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
}

export interface RuntimeGraphNodeRecord {
  nodeId: string;
  graphSnapshotId: string;
  experimentId: string;
  revisionId: string;
  entityId: string;
  blockId?: string;
  reactionFamily?: string;
  routeId?: string;
  sourceRange: RuntimeGraphSourceRange;
  payload: RuntimeJsonObject;
  createdAt: string;
}

export interface RuntimeGraphEdgeRecord {
  edgeId: string;
  graphSnapshotId: string;
  experimentId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: RuntimeGraphEdgeType;
  confidence: "low" | "medium" | "high" | "unknown";
  evidence: RuntimeJsonObject;
  createdAt: string;
}

export interface RuntimeRagChunkCitationRecord {
  revisionId: string;
  chunkId: string;
  experimentId: string;
  entityId?: string;
  blockId?: string;
  sourceRange: RuntimeGraphSourceRange;
  citation: RuntimeJsonObject;
  quality: RuntimeJsonObject;
  createdAt: string;
}

export interface RuntimeAgentRunRecord {
  agentRunId: string;
  experimentId?: string;
  revisionId?: string;
  status: RuntimeAgentRunStatus;
  goal: string;
  startedAt: string;
  finishedAt?: string;
}

export interface RuntimeAgentToolCallRecord {
  toolCallId: string;
  agentRunId: string;
  toolName: string;
  input: RuntimeJsonObject;
  output?: RuntimeJsonObject;
  status: RuntimeAgentToolCallStatus;
  createdAt: string;
}

export interface RuntimePatchProposalRecord {
  patchProposalId: string;
  agentRunId?: string;
  experimentId: string;
  baseRevisionId: string;
  patch: RuntimeJsonObject;
  status: "proposed" | "validated" | "rejected" | "applied";
  validationResult?: RuntimeJsonObject;
  createdAt: string;
  appliedAt?: string;
}

export interface PersistRuntimeGraphRagPayload {
  graphSnapshot: RuntimeGraphSnapshotRecord;
  nodes?: RuntimeGraphNodeRecord[];
  edges?: RuntimeGraphEdgeRecord[];
  citationCandidates?: RuntimeRagChunkCitationRecord[];
  agentRuns?: RuntimeAgentRunRecord[];
  agentToolCalls?: RuntimeAgentToolCallRecord[];
  patchProposals?: RuntimePatchProposalRecord[];
  metadata?: RuntimeJsonObject;
  createdAt?: string;
}

export interface PersistRuntimeGraphRagCounts {
  snapshots: number; nodes: number; edges: number; citations: number;
  agentRuns: number; agentToolCalls: number; patchProposals: number;
}

export interface PersistRuntimeGraphRagResult {
  state: RuntimeState;
  label: string;
  detail: string;
  graphSnapshotId: string;
  experimentId: string;
  counts: PersistRuntimeGraphRagCounts;
  target: PostgresTargetSummary;
}

export type LocalOutboxSyncStatus = "pending" | "synced" | "failed";

export interface LocalStoreStatus {
  state: RuntimeState;
  label: string;
  detail: string;
  available: boolean;
  storagePath: string | null;
  outboxPendingCount: number;
  outboxFailedCount: number;
  lastSavedAt: string | null;
  lastSyncedAt: string | null;
}

export interface LocalRuntimeSnapshotInput {
  localId: string;
  idempotencyKey: string;
  payload: PersistRuntimeGraphRagPayload;
  metadata: RuntimeJsonObject;
  createdAt: string;
}

export interface LocalOutboxEntry extends LocalRuntimeSnapshotInput {
  syncStatus: LocalOutboxSyncStatus;
  failureCount: number;
  lastError: string | null;
  updatedAt: string;
  syncedAt: string | null;
}

export interface SaveLocalRuntimeSnapshotResult {
  localId: string;
  idempotencyKey: string;
  syncStatus: LocalOutboxSyncStatus;
  createdAt: string;
  outboxPendingCount: number;
}

export interface LocalReactionIntelligenceArtifactInput {
  localId: string;
  idempotencyKey: string;
  artifact: ChemdReactionIntelligenceArtifactV1;
  metadata: RuntimeJsonObject;
  createdAt: string;
}

export interface LocalReactionIntelligenceArtifactEntry extends LocalReactionIntelligenceArtifactInput {
  updatedAt: string;
}

export interface SaveLocalReactionIntelligenceArtifactResult {
  localId: string;
  idempotencyKey: string;
  createdAt: string;
  artifactCount: number;
}

export interface LocalOutboxMutationResult {
  updated: number;
  outboxPendingCount: number;
  outboxFailedCount: number;
}

export type LocalOutboxSyncTargetKind = "external" | "managed";

export interface LocalOutboxSyncTargetSummary extends PostgresTargetSummary {
  kind: LocalOutboxSyncTargetKind;
}

export interface LocalOutboxSyncEntryResult {
  localId: string;
  idempotencyKey: string;
  syncStatus: LocalOutboxSyncStatus;
  graphSnapshotId?: string;
  error?: string;
}

export interface LocalOutboxSyncSummary {
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  entries: LocalOutboxSyncEntryResult[];
}

export interface LocalOutboxSyncResult extends LocalOutboxSyncSummary {
  state: RuntimeState;
  label: string;
  detail: string;
  target: LocalOutboxSyncTargetSummary;
}

export type ReactionIntelligenceWorkerStatus = "completed" | "skipped" | "failed";

export interface ReactionIntelligenceWorkerInput {
  jobJson: ChemdReactionIntelligenceJobInputV1;
  providers?: ChemdReactionIntelligenceProviderKindV1[];
  missingDependency?: ChemdReactionIntelligenceMissingDependencyPolicyV1;
  pretty?: boolean;
  timeoutMs?: number;
}

export interface ReactionIntelligenceWorkerResult {
  status: ReactionIntelligenceWorkerStatus;
  message: string;
  reason: string | null;
  detail: string | null;
  artifactJson: ChemdReactionIntelligenceArtifactV1 | null;
  exitCode: number | null;
  stdoutTail: string[];
  stderrTail: string[];
}

export type LocalAuthoringCompileState = "compiled" | "failed" | "pending" | "skipped";
export type LocalAuthoringStepState = "saved" | "compiled" | "pending" | "failed" | "skipped";
export type LocalSyncDisplayState = "pending" | "synced" | "failed" | "skipped";
export type WorkspaceIngestQueueStatus = "pending" | "running" | "synced" | "failed" | "skipped";

export interface LocalAuthoringStepSummary {
  state: LocalAuthoringStepState;
  label: string;
  detail: string;
  at: string | null;
  error: string | null;
}

export interface LocalOutboxDisplayEntry {
  localId: string;
  idempotencyKey: string;
  syncStatus: LocalOutboxSyncStatus;
  graphSnapshotId: string | null;
  failureCount: number;
  canRetry: boolean;
  error: string | null;
}

export interface LocalOutboxDisplaySummary {
  state: LocalSyncDisplayState;
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  retryableCount: number;
  totalCount: number;
  databaseAvailable: boolean;
  message: string;
  lastError: string | null;
  entries: LocalOutboxDisplayEntry[];
}

export interface LocalAuthoringStatus {
  saved: LocalAuthoringStepSummary;
  compiled: LocalAuthoringStepSummary;
  snapshot: LocalAuthoringStepSummary;
  sync: LocalOutboxDisplaySummary;
}

export interface WorkspaceIngestDocumentMetadata {
  workspaceId: string;
  documentPath: string;
  documentHash: string;
  documentId?: string;
  revisionId?: string;
  revisionHash?: string;
  modifiedAtMs?: number | null;
}

export interface WorkspaceIngestQueueItem {
  queueId: string;
  idempotencyKey: string;
  workspaceId: string;
  documentId: string | null;
  documentPath: string;
  documentHash: string;
  revisionHash: string;
  snapshotHash: string;
  graphSnapshotId: string | null;
  status: WorkspaceIngestQueueStatus;
  failureCount: number;
  errorSummary: string | null;
  runtimePayload?: PersistRuntimeGraphRagPayload;
  metadata: RuntimeJsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceIngestQueueErrorSummary {
  queueId: string;
  documentPath: string;
  status: WorkspaceIngestQueueStatus;
  failureCount: number;
  retryable: boolean;
  errorSummary: string;
}

export interface WorkspaceIngestQueueSummary {
  pendingCount: number;
  runningCount: number;
  syncedCount: number;
  failedCount: number;
  skippedCount: number;
  retryableCount: number;
  totalCount: number;
  errors: WorkspaceIngestQueueErrorSummary[];
}

export interface DesktopCommandError {
  code: string;
  message: string;
  detail?: string;
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  bytes: number;
  contentHash: string;
  modifiedAtMs: number | null;
  chemdKind?: "document" | "asset" | "unknown";
}

export interface WorkspaceWriteResult {
  path: string;
  bytes: number;
  contentHash: string;
  modifiedAtMs: number | null;
  chemdKind?: "document" | "asset" | "unknown";
}

export interface DiagnosticsBundleSummary {
  generatedAt: string;
  commandCount: number;
  boundarySkipCount: number;
  supportCommandCount: number;
}

export interface DiagnosticsBundleExportResult {
  state: RuntimeState;
  label: string;
  detail: string;
  outputPath: string;
  summary: DiagnosticsBundleSummary;
}

export interface DesktopCommandMap {
  open_workspace: {
    input: {
      rootPath?: string;
    };
    output: WorkspaceHandle;
  };
  list_workspace_files: {
    input: {
      workspaceId?: string;
      rootPath?: string;
    };
    output: WorkspaceFileEntry[];
  };
  read_workspace_file: {
    input: {
      workspaceId?: string;
      rootPath?: string;
      path: string;
    };
    output: WorkspaceFileContent;
  };
  write_workspace_file: {
    input: {
      workspaceId?: string;
      rootPath?: string;
      path: string;
      content: string;
      baseHash?: string;
    };
    output: WorkspaceWriteResult;
  };
  start_sidecar: {
    input: void;
    output: SidecarStatus;
  };
  stop_sidecar: {
    input: void;
    output: SidecarStatus;
  };
  read_sidecar_status: {
    input: void;
    output: SidecarStatus;
  };
  read_sidecar_logs: {
    input: void;
    output: SidecarLogs;
  };
  read_postgres_status: {
    input: void;
    output: PostgresStatus;
  };
  list_postgres_profiles: {
    input: void;
    output: PostgresProfilesState;
  };
  save_postgres_profile: {
    input: {
      input: SavePostgresProfileInput;
    };
    output: PostgresProfilesState;
  };
  activate_postgres_profile: {
    input: {
      profileId: string;
    };
    output: PostgresProfilesState;
  };
  delete_postgres_profile: {
    input: {
      profileId: string;
    };
    output: PostgresProfilesState;
  };
  read_managed_postgres_status: {
    input: void;
    output: ManagedPostgresStatus;
  };
  initialize_managed_postgres: {
    input: void;
    output: ManagedPostgresStatus;
  };
  start_managed_postgres: {
    input: void;
    output: ManagedPostgresStatus;
  };
  stop_managed_postgres: {
    input: void;
    output: ManagedPostgresStatus;
  };
  migrate_managed_postgres: {
    input: void;
    output: ManagedPostgresStatus;
  };
  persist_runtime_graph_rag: {
    input: {
      payload: PersistRuntimeGraphRagPayload;
    };
    output: PersistRuntimeGraphRagResult;
  };
  read_local_store_status: {
    input: void;
    output: LocalStoreStatus;
  };
  save_local_runtime_snapshot: {
    input: LocalRuntimeSnapshotInput;
    output: SaveLocalRuntimeSnapshotResult;
  };
  save_local_reaction_intelligence_artifact: {
    input: LocalReactionIntelligenceArtifactInput;
    output: SaveLocalReactionIntelligenceArtifactResult;
  };
  list_local_reaction_intelligence_artifacts: {
    input: {
      graphIndexId?: string;
      limit?: number;
    };
    output: LocalReactionIntelligenceArtifactEntry[];
  };
  list_local_outbox: {
    input: {
      syncStatus?: LocalOutboxSyncStatus;
      limit?: number;
    };
    output: LocalOutboxEntry[];
  };
  mark_local_outbox_synced: {
    input: {
      localIds: string[];
      syncedAt?: string;
    };
    output: LocalOutboxMutationResult;
  };
  clear_local_outbox_failures: {
    input: void;
    output: LocalOutboxMutationResult;
  };
  sync_local_outbox_to_postgres: {
    input: void;
    output: LocalOutboxSyncResult;
  };
  run_reaction_intelligence_worker: {
    input: ReactionIntelligenceWorkerInput;
    output: ReactionIntelligenceWorkerResult;
  };
  export_diagnostics_bundle: {
    input: void;
    output: DiagnosticsBundleExportResult;
  };
}

export const shellWorkspace: WorkspaceHandle = {
  workspaceId: "placeholder-workspace",
  displayName: "No workspace selected",
  rootPath: "",
  rootHint: "Use Tauri open_workspace in Phase 1",
  writable: false
};

export const shellFiles: WorkspaceFileEntry[] = [
  {
    id: "exp-001",
    name: "suzuki-screen.chemd.md",
    path: "/workspace/experiments/suzuki-screen.chemd.md",
    kind: "file",
    chemdKind: "document"
  },
  {
    id: "exp-002",
    name: "materials",
    path: "/workspace/materials",
    kind: "directory"
  },
  {
    id: "exp-003",
    name: "calibration.chemd.md",
    path: "/workspace/experiments/calibration.chemd.md",
    kind: "file",
    chemdKind: "document"
  }
];

export const shellSidecarStatus: SidecarStatus = {
  state: "placeholder",
  label: "Sidecar idle",
  detail: "chem-service lifecycle boundary is declared but not connected",
  pid: null,
  startedAt: null,
  logTail: []
};

export const shellPostgresStatus: PostgresStatus = {
  state: "placeholder",
  label: "Postgres not configured",
  detail: "Set CHEMD_POSTGRES_DATABASE_URL or DATABASE_URL to enable database checks",
  configured: false,
  source: null,
  host: null,
  database: null,
  user: null,
  ssl: "not configured",
  vectorInstalled: null,
  schemaReady: null,
  migrationState: "unknown",
  migrationReason: "No Postgres target is configured; Offline Core remains available",
  coreTablesFound: null,
  timeoutMs: 0,
  pool: null
};

export const shellDiagnosticsBundleResult: DiagnosticsBundleExportResult = {
  state: "placeholder",
  label: "Diagnostics bundle not exported",
  detail: "Use Tauri export_diagnostics_bundle to write an offline redacted JSON bundle",
  outputPath: "",
  summary: {
    generatedAt: "",
    commandCount: 29,
    boundarySkipCount: 5,
    supportCommandCount: 4
  }
};
