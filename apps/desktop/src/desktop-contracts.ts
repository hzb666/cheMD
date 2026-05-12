export type RuntimeState = "ready" | "placeholder" | "degraded" | "offline";

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
  timeoutMs: number;
  pool: string | null;
}

export interface PostgresTargetSummary {
  source: string; host: string | null; database: string | null; user: string | null;
  ssl: string; timeoutMs: number; pool: string | null;
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

export interface DesktopCommandError {
  code: string;
  message: string;
  detail?: string;
}

export interface WorkspaceFileContent {
  path: string;
  content: string;
  bytes: number;
  chemdKind?: "document" | "asset" | "unknown";
}

export interface WorkspaceWriteResult {
  path: string;
  bytes: number;
  chemdKind?: "document" | "asset" | "unknown";
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
  timeoutMs: 0,
  pool: null
};
