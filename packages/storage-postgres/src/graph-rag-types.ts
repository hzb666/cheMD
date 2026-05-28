import type {
  ChemdRagExportV1,
  ChemdTrainingExportV3,
  ChemdTrainingGraphIndexV1
} from "@chemd/exporter-training";

import type { JsonRecord } from "./types";

export interface PostgresSourceRangeRecord {
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
}

export interface PostgresCitationRecord {
  experimentId: string;
  revisionId: string;
  chunkId?: string;
  entityId?: string;
  sourceRange: PostgresSourceRangeRecord;
}

export type PostgresReactionGraphEdgeType =
  | "route_prev"
  | "route_next"
  | "same_family"
  | "same_condition_signature"
  | "same_substrate"
  | "same_product"
  | "campaign_trajectory"
  | "semantic_similarity"
  | "evidence_link";

export interface PostgresReactionGraphSnapshotRecord {
  graphSnapshotId: string;
  experimentId: string;
  sourceRevisionIds: string[];
  graphKind: "reaction" | "rag_context" | "agent_audit";
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
}

export interface PostgresReactionGraphNodeRecord {
  nodeId: string;
  graphSnapshotId: string;
  experimentId: string;
  revisionId: string;
  entityId: string;
  blockId?: string;
  reactionFamily?: string;
  routeId?: string;
  sourceRange: PostgresSourceRangeRecord;
  payload: JsonRecord;
  createdAt: string;
}

export interface PostgresReactionGraphEdgeRecord {
  edgeId: string;
  graphSnapshotId: string;
  experimentId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: PostgresReactionGraphEdgeType;
  confidence: "low" | "medium" | "high" | "unknown";
  evidence: JsonRecord;
  createdAt: string;
}

export interface PostgresRagChunkCitationRecord {
  revisionId: string;
  chunkId: string;
  experimentId: string;
  entityId?: string;
  blockId?: string;
  sourceRange: PostgresSourceRangeRecord;
  citation: PostgresCitationRecord;
  quality: JsonRecord;
  createdAt: string;
}

export interface PostgresAgentRunRecord {
  agentRunId: string;
  experimentId?: string;
  revisionId?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  goal: string;
  auditTimeline: readonly JsonRecord[];
  startedAt: string;
  finishedAt?: string;
}

export interface PostgresAgentToolCallRecord {
  toolCallId: string;
  agentRunId: string;
  toolName: string;
  input: JsonRecord;
  output?: JsonRecord;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: string;
}

export interface PostgresPatchProposalRecord {
  patchProposalId: string;
  agentRunId?: string;
  experimentId: string;
  baseRevisionId: string;
  patch: JsonRecord;
  status: "proposed" | "validated" | "rejected" | "applied";
  validationResult?: JsonRecord;
  createdAt: string;
  appliedAt?: string;
}

export interface BuildPostgresGraphRagStorageInput {
  experimentId: string;
  revisionId: string;
  createdAt?: string;
  trainingExport: ChemdTrainingExportV3;
  ragExport: ChemdRagExportV1;
  graphIndex?: ChemdTrainingGraphIndexV1;
  graphSnapshotId?: string;
  graphKind?: PostgresReactionGraphSnapshotRecord["graphKind"];
  sourceRangesByEntityId?: Readonly<Record<string, PostgresSourceRangeRecord>>;
  sourceRangesByChunkId?: Readonly<Record<string, PostgresSourceRangeRecord>>;
  graphEdgeEvidenceByEdgeId?: Readonly<Record<string, JsonRecord>>;
  agentRuns?: readonly PostgresAgentRunRecord[];
  agentToolCalls?: readonly PostgresAgentToolCallRecord[];
  patchProposals?: readonly PostgresPatchProposalRecord[];
}

export interface PostgresGraphRagStorageRecords {
  graphSnapshot?: PostgresReactionGraphSnapshotRecord;
  reactionGraphNodes: PostgresReactionGraphNodeRecord[];
  reactionGraphEdges: PostgresReactionGraphEdgeRecord[];
  ragChunkCitations: PostgresRagChunkCitationRecord[];
  agentRuns: PostgresAgentRunRecord[];
  agentToolCalls: PostgresAgentToolCallRecord[];
  patchProposals: PostgresPatchProposalRecord[];
}

export interface PostgresGraphRagQuery {
  sql: string;
  values: readonly unknown[];
}

export interface PostgresGraphRagClient {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
}

export interface UpsertPostgresGraphSnapshotInput {
  graphSnapshot: PostgresReactionGraphSnapshotRecord;
  nodes?: readonly PostgresReactionGraphNodeRecord[];
  edges?: readonly PostgresReactionGraphEdgeRecord[];
}

export interface ListPostgresGraphSnapshotSummariesInput {
  experimentId?: string;
  graphKind?: PostgresReactionGraphSnapshotRecord["graphKind"];
  limit?: number;
}

export interface LoadPostgresGraphDetailInput {
  graphSnapshotId: string;
}

export interface PostgresGraphDetailQueries {
  snapshot: PostgresGraphRagQuery;
  nodes: PostgresGraphRagQuery;
  edges: PostgresGraphRagQuery;
}

export interface PostgresGraphDetail {
  snapshot?: PostgresReactionGraphSnapshotRecord;
  nodes: PostgresReactionGraphNodeRecord[];
  edges: PostgresReactionGraphEdgeRecord[];
}

export interface ListPendingPostgresPatchProposalsInput {
  experimentId?: string;
  baseRevisionId?: string;
  limit?: number;
}
