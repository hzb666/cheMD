import type {
  PostgresAgentRunRecord,
  PostgresAgentToolCallRecord,
  PostgresPatchProposalRecord,
  PostgresRagChunkCitationRecord,
  PostgresReactionGraphEdgeRecord,
  PostgresReactionGraphEdgeType,
  PostgresReactionGraphSnapshotRecord,
  PostgresSourceRangeRecord,
  UpsertPostgresGraphSnapshotInput
} from "./graph-rag-types";

export type RuntimeEditorGraphEdgeType =
  | PostgresReactionGraphEdgeType
  | "document_order"
  | "block_contains_entity"
  | "diagnostic_evidence";

export type RuntimeAgentRunStatus =
  | PostgresAgentRunRecord["status"]
  | "created"
  | "waiting_for_approval"
  | "applying_patch"
  | "validating"
  | "completed"
  | "blocked"
  | "canceled";

export type RuntimeAgentToolCallStatus =
  | PostgresAgentToolCallRecord["status"]
  | "ok"
  | "blocked";

export interface RuntimeEditorGraphSnapshot {
  graphSnapshotId: string;
  experimentId: string;
  sourceRevisionIds: readonly string[];
  graphKind: PostgresReactionGraphSnapshotRecord["graphKind"];
  nodeCount?: number;
  edgeCount?: number;
  createdAt?: string;
}

export interface RuntimeEditorGraphNode {
  nodeId: string;
  graphSnapshotId: string;
  experimentId: string;
  revisionId: string;
  entityId: string;
  nodeKind?: string;
  blockId?: string;
  reactionFamily?: string;
  routeId?: string;
  sourceRange: PostgresSourceRangeRecord;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export interface RuntimeEditorGraphEdge {
  edgeId: string;
  graphSnapshotId: string;
  experimentId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: RuntimeEditorGraphEdgeType;
  confidence: PostgresReactionGraphEdgeRecord["confidence"];
  evidence: Record<string, unknown>;
  createdAt?: string;
}

export interface RuntimeEditorCitationCandidate {
  citationId: string;
  revisionId: string;
  chunkId: string;
  experimentId: string;
  documentUri?: string;
  entityId?: string;
  blockId?: string;
  sourceRange: PostgresSourceRangeRecord;
  citation?: {
    experimentId?: string;
    revisionId?: string;
    chunkId?: string;
    entityId?: string;
    sourceRange?: PostgresSourceRangeRecord;
  };
  quality: Record<string, unknown>;
  createdAt?: string;
}

export interface RuntimeAgentRunInput {
  agentRunId: string;
  experimentId?: string;
  revisionId?: string;
  status?: RuntimeAgentRunStatus;
  goal: string;
  createdAt?: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  auditTimeline?: readonly unknown[];
}

export interface RuntimeAgentToolCallInput {
  toolCallId: string;
  agentRunId: string;
  toolName: string;
  input?: unknown;
  payload?: unknown;
  output?: unknown;
  result?: unknown;
  status?: RuntimeAgentToolCallStatus;
  createdAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RuntimePatchProposalInput {
  patchProposalId: string;
  agentRunId?: string;
  experimentId: string;
  baseRevisionId?: string;
  defaultBaseRevisionId?: string;
  patch?: unknown;
  documentId?: string;
  beforeHash?: string;
  title?: string;
  rationale?: string;
  edits?: readonly unknown[];
  evidence?: readonly unknown[];
  status?: PostgresPatchProposalRecord["status"];
  validationResult?: unknown;
  createdAt?: string;
  appliedAt?: string;
}

export interface BuildPostgresRuntimeGraphRagInput {
  graphSnapshot: RuntimeEditorGraphSnapshot;
  nodes?: readonly RuntimeEditorGraphNode[];
  edges?: readonly RuntimeEditorGraphEdge[];
  citationCandidates?: readonly RuntimeEditorCitationCandidate[];
  agentRuns?: readonly RuntimeAgentRunInput[];
  agentToolCalls?: readonly RuntimeAgentToolCallInput[];
  patchProposals?: readonly RuntimePatchProposalInput[];
  createdAt?: string;
  now?: () => string;
}

export interface PostgresRuntimeGraphRagRecords {
  graphSnapshotInput: UpsertPostgresGraphSnapshotInput;
  ragChunkCitations: PostgresRagChunkCitationRecord[];
  agentRuns: PostgresAgentRunRecord[];
  agentToolCalls: PostgresAgentToolCallRecord[];
  patchProposals: PostgresPatchProposalRecord[];
}
