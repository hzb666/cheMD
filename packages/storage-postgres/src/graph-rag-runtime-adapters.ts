import type {
  PostgresAgentRunRecord,
  PostgresAgentToolCallRecord,
  PostgresPatchProposalRecord,
  PostgresRagChunkCitationRecord,
  PostgresReactionGraphEdgeRecord,
  PostgresReactionGraphEdgeType,
  PostgresReactionGraphNodeRecord,
  UpsertPostgresGraphSnapshotInput
} from "./graph-rag-types";
import type {
  BuildPostgresRuntimeGraphRagInput,
  PostgresRuntimeGraphRagRecords,
  RuntimeAgentRunInput,
  RuntimeAgentRunStatus,
  RuntimeAgentToolCallInput,
  RuntimeAgentToolCallStatus,
  RuntimeEditorCitationCandidate,
  RuntimeEditorGraphEdge,
  RuntimeEditorGraphEdgeType,
  RuntimeEditorGraphNode,
  RuntimePatchProposalInput
} from "./graph-rag-runtime-types";
import type { JsonRecord } from "./types";

const sharedGraphEdgeTypes = new Set<PostgresReactionGraphEdgeType>([
  "route_prev",
  "route_next",
  "same_family",
  "same_condition_signature",
  "same_substrate",
  "same_product",
  "campaign_trajectory",
  "semantic_similarity",
  "evidence_link"
]);

const getCreatedAt = (
  input: { createdAt?: string },
  fallback: string
): string => input.createdAt ?? fallback;

const getNow = (now?: () => string): string =>
  now ? now() : new Date().toISOString();

const toJsonRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : { value };

const toGraphEdgeType = (
  edgeType: RuntimeEditorGraphEdgeType
): PostgresReactionGraphEdgeType =>
  sharedGraphEdgeTypes.has(edgeType as PostgresReactionGraphEdgeType)
    ? edgeType as PostgresReactionGraphEdgeType
    : "evidence_link";

const mapRuntimeAgentRunStatus = (
  status: RuntimeAgentRunStatus | undefined
): PostgresAgentRunRecord["status"] => {
  if (!status || status === "created") {
    return "queued";
  }
  if (status === "completed") {
    return "succeeded";
  }
  if (status === "canceled") {
    return "cancelled";
  }
  if (
    status === "waiting_for_approval"
    || status === "applying_patch"
    || status === "validating"
  ) {
    return "running";
  }
  if (status === "blocked") {
    return "failed";
  }
  return status;
};

const mapRuntimeToolStatus = (
  status: RuntimeAgentToolCallStatus | undefined
): PostgresAgentToolCallRecord["status"] => {
  if (!status) {
    return "queued";
  }
  if (status === "ok") {
    return "succeeded";
  }
  if (status === "blocked") {
    return "failed";
  }
  return status;
};

export const buildPostgresGraphSnapshotInputFromRuntime = (
  input: BuildPostgresRuntimeGraphRagInput
): UpsertPostgresGraphSnapshotInput => {
  const createdAt = input.createdAt ?? input.graphSnapshot.createdAt ?? getNow(input.now);
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];
  return {
    graphSnapshot: {
      graphSnapshotId: input.graphSnapshot.graphSnapshotId,
      experimentId: input.graphSnapshot.experimentId,
      sourceRevisionIds: [...input.graphSnapshot.sourceRevisionIds],
      graphKind: input.graphSnapshot.graphKind,
      nodeCount: input.graphSnapshot.nodeCount ?? nodes.length,
      edgeCount: input.graphSnapshot.edgeCount ?? edges.length,
      createdAt
    },
    nodes: nodes.map((node) => buildPostgresGraphNodeRecord(node, createdAt)),
    edges: edges.map((edge) => buildPostgresGraphEdgeRecord(edge, createdAt))
  };
};

export const buildPostgresGraphNodeRecord = (
  input: RuntimeEditorGraphNode,
  fallbackCreatedAt: string
): PostgresReactionGraphNodeRecord => ({
  nodeId: input.nodeId,
  graphSnapshotId: input.graphSnapshotId,
  experimentId: input.experimentId,
  revisionId: input.revisionId,
  entityId: input.entityId,
  blockId: input.blockId,
  reactionFamily: input.reactionFamily,
  routeId: input.routeId,
  sourceRange: input.sourceRange,
  payload: {
    ...input.payload,
    node_kind: input.nodeKind
  },
  createdAt: getCreatedAt(input, fallbackCreatedAt)
});

export const buildPostgresGraphEdgeRecord = (
  input: RuntimeEditorGraphEdge,
  fallbackCreatedAt: string
): PostgresReactionGraphEdgeRecord => ({
  edgeId: input.edgeId,
  graphSnapshotId: input.graphSnapshotId,
  experimentId: input.experimentId,
  fromNodeId: input.fromNodeId,
  toNodeId: input.toNodeId,
  edgeType: toGraphEdgeType(input.edgeType),
  confidence: input.confidence,
  evidence: {
    ...input.evidence,
    runtime_edge_type: input.edgeType
  },
  createdAt: getCreatedAt(input, fallbackCreatedAt)
});

export const buildPostgresRagChunkCitationRecordsFromRuntime = (
  candidates: readonly RuntimeEditorCitationCandidate[],
  options: { createdAt?: string; now?: () => string } = {}
): PostgresRagChunkCitationRecord[] => {
  const fallbackCreatedAt = options.createdAt ?? getNow(options.now);
  return candidates.map((candidate) =>
    buildPostgresRagChunkCitationRecord(candidate, fallbackCreatedAt)
  );
};

export const buildPostgresRagChunkCitationRecord = (
  input: RuntimeEditorCitationCandidate,
  fallbackCreatedAt: string
): PostgresRagChunkCitationRecord => ({
  revisionId: input.revisionId,
  chunkId: input.chunkId,
  experimentId: input.experimentId,
  entityId: input.entityId,
  blockId: input.blockId,
  sourceRange: input.sourceRange,
  citation: {
    experimentId: input.citation?.experimentId ?? input.experimentId,
    revisionId: input.citation?.revisionId ?? input.revisionId,
    chunkId: input.citation?.chunkId ?? input.chunkId,
    entityId: input.citation?.entityId ?? input.entityId,
    sourceRange: input.citation?.sourceRange ?? input.sourceRange
  },
  quality: {
    ...input.quality,
    citation_id: input.citationId,
    document_uri: input.documentUri,
    runtime_citation: input.citation ? toJsonRecord(input.citation) : undefined
  },
  createdAt: getCreatedAt(input, fallbackCreatedAt)
});

export const buildPostgresAgentRunRecordFromRuntime = (
  input: RuntimeAgentRunInput,
  options: { createdAt?: string; now?: () => string } = {}
): PostgresAgentRunRecord => {
  const fallback = options.createdAt ?? getNow(options.now);
  return {
    agentRunId: input.agentRunId,
    experimentId: input.experimentId,
    revisionId: input.revisionId,
    status: mapRuntimeAgentRunStatus(input.status),
    goal: input.goal,
    auditTimeline: (input.auditTimeline ?? []).map(toJsonRecord),
    startedAt: input.startedAt ?? input.createdAt ?? fallback,
    finishedAt: input.finishedAt
  };
};

export const buildPostgresAgentToolCallRecordFromRuntime = (
  input: RuntimeAgentToolCallInput,
  options: { createdAt?: string; now?: () => string } = {}
): PostgresAgentToolCallRecord => {
  const fallback = options.createdAt ?? getNow(options.now);
  return {
    toolCallId: input.toolCallId,
    agentRunId: input.agentRunId,
    toolName: input.toolName,
    input: toJsonRecord(input.input ?? input.payload ?? {}),
    output: input.output !== undefined || input.result !== undefined
      ? toJsonRecord(input.output ?? input.result)
      : undefined,
    status: mapRuntimeToolStatus(input.status),
    createdAt: input.createdAt ?? input.startedAt ?? fallback
  };
};

export const buildPostgresPatchProposalRecordFromRuntime = (
  input: RuntimePatchProposalInput,
  options: { createdAt?: string; now?: () => string } = {}
): PostgresPatchProposalRecord => {
  const baseRevisionId = input.baseRevisionId ?? input.defaultBaseRevisionId;
  if (!baseRevisionId) {
    throw new Error(`Missing base revision for patch proposal ${input.patchProposalId}`);
  }
  return {
    patchProposalId: input.patchProposalId,
    agentRunId: input.agentRunId,
    experimentId: input.experimentId,
    baseRevisionId,
    patch: toPatchPayload(input),
    status: input.status ?? "proposed",
    validationResult: input.validationResult
      ? toJsonRecord(input.validationResult)
      : undefined,
    createdAt: input.createdAt ?? options.createdAt ?? getNow(options.now),
    appliedAt: input.appliedAt
  };
};

const toPatchPayload = (input: RuntimePatchProposalInput): JsonRecord => {
  if (input.patch !== undefined) {
    return toJsonRecord(input.patch);
  }
  return {
    document_id: input.documentId,
    before_hash: input.beforeHash,
    title: input.title,
    rationale: input.rationale,
    edits: input.edits ?? [],
    evidence: input.evidence ?? []
  };
};

export const buildPostgresRuntimeGraphRagRecords = (
  input: BuildPostgresRuntimeGraphRagInput
): PostgresRuntimeGraphRagRecords => {
  const createdAt = input.createdAt ?? input.graphSnapshot.createdAt ?? getNow(input.now);
  return {
    graphSnapshotInput: buildPostgresGraphSnapshotInputFromRuntime({
      ...input,
      createdAt
    }),
    ragChunkCitations: buildPostgresRagChunkCitationRecordsFromRuntime(
      input.citationCandidates ?? [],
      { createdAt }
    ),
    agentRuns: (input.agentRuns ?? []).map((run) =>
      buildPostgresAgentRunRecordFromRuntime(run, { createdAt })
    ),
    agentToolCalls: (input.agentToolCalls ?? []).map((toolCall) =>
      buildPostgresAgentToolCallRecordFromRuntime(toolCall, { createdAt })
    ),
    patchProposals: (input.patchProposals ?? []).map((proposal) =>
      buildPostgresPatchProposalRecordFromRuntime(proposal, { createdAt })
    )
  };
};
