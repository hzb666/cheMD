import type { AgentRun, AgentToolCall, PatchProposal } from "@chemd/agent-tools";
import type { EditorGraphRagCitationCandidate, EditorGraphRagEdge, EditorGraphRagNode, EditorGraphRagRecords, EditorGraphRagSnapshot } from "@chemd/language-service";

export const persistRuntimeGraphRagCommand = "persist_runtime_graph_rag" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export interface RuntimeWorkspaceMetadata { workspaceId: string; rootPath?: string; displayName?: string; }

export interface RuntimeDocumentMetadata {
  path: string; documentId?: string; documentUri?: string; name?: string; revisionId?: string; experimentId?: string;
}

export interface BuildRuntimePersistencePayloadInput {
  records: EditorGraphRagRecords; source: string; workspace: RuntimeWorkspaceMetadata;
  document: RuntimeDocumentMetadata; agentRun?: AgentRun | null; agentRuns?: readonly AgentRun[]; createdAt?: string;
}

export interface PersistRuntimeGraphRagPayload {
  graphSnapshot: JsonRecord; nodes: JsonRecord[]; edges: JsonRecord[]; citationCandidates: JsonRecord[];
  agentRuns: JsonRecord[]; agentToolCalls: JsonRecord[]; patchProposals: JsonRecord[]; metadata: JsonRecord; createdAt: string;
}

export interface PersistRuntimeGraphRagCommandInput { payload: PersistRuntimeGraphRagPayload; }

interface RuntimeIdentity {
  workspaceId: string; documentPath: string; documentId: string; documentUri: string;
  experimentId: string; revisionId: string; graphSnapshotId: string; createdAt: string;
}

const TERMINAL_STATUSES = new Set<AgentRun["status"]>(["completed", "failed", "blocked", "canceled"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required desktop runtime persistence field: ${field}`);
  }
  return value;
};

const stableSegment = (value: string): string =>
  value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "-");

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const makeStableId = (...parts: readonly string[]): string =>
  parts.map(stableSegment).join("::");

const toJsonSafe = (value: unknown): JsonValue | undefined => {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) return objectFromEntries([...value.entries()]);
  if (value instanceof Set) return [...value.values()].map((item) => toJsonSafe(item) ?? null);
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item) ?? null);
  return isRecord(value) ? objectFromEntries(Object.entries(value)) : {};
};

const objectFromEntries = (entries: readonly (readonly [unknown, unknown])[]): JsonRecord => {
  const record: JsonRecord = {};
  for (const [key, value] of entries) {
    if (typeof key !== "string") continue;
    const safeValue = toJsonSafe(value);
    if (safeValue !== undefined) record[key] = safeValue;
  }
  return record;
};

const toJsonRecord = (value: unknown): JsonRecord => {
  const safe = toJsonSafe(value);
  return isRecord(safe) ? safe as JsonRecord : { value: safe ?? null };
};

const getRevisionId = (input: BuildRuntimePersistencePayloadInput): string =>
  requireString(input.document.revisionId ?? input.records.graphSnapshot.sourceRevisionIds[0], "revisionId");

const buildIdentity = (input: BuildRuntimePersistencePayloadInput): RuntimeIdentity => {
  const workspaceId = requireString(input.workspace.workspaceId, "workspace.workspaceId");
  const documentPath = requireString(input.document.path, "document.path");
  const revisionId = getRevisionId(input);
  const experimentId = requireString(input.document.experimentId ?? input.records.graphSnapshot.experimentId, "experimentId");
  return {
    workspaceId,
    documentPath,
    documentId: input.document.documentId ?? documentPath,
    documentUri: input.document.documentUri ?? documentPath,
    experimentId,
    revisionId,
    graphSnapshotId: makeStableId("desktop-editor-graph", workspaceId, hashString(documentPath), revisionId),
    createdAt: input.createdAt ?? input.records.graphSnapshot.createdAt
  };
};

const buildGraphSnapshot = (
  snapshot: EditorGraphRagSnapshot,
  identity: RuntimeIdentity,
  nodeCount: number,
  edgeCount: number
): JsonRecord => toJsonRecord({
  ...snapshot,
  graphSnapshotId: identity.graphSnapshotId,
  experimentId: identity.experimentId,
  sourceRevisionIds: [identity.revisionId],
  nodeCount,
  edgeCount,
  createdAt: identity.createdAt
});

const buildNodeIdMap = (
  nodes: readonly EditorGraphRagNode[],
  identity: RuntimeIdentity
): Map<string, string> => new Map(nodes.map((node) => [
  node.nodeId,
  makeStableId(identity.graphSnapshotId, "node", node.nodeKind, node.entityId, hashString(node.nodeId))
]));

const buildNodes = (
  nodes: readonly EditorGraphRagNode[],
  identity: RuntimeIdentity,
  nodeIds: ReadonlyMap<string, string>
): JsonRecord[] => nodes.map((node) => toJsonRecord({
  ...node,
  nodeId: nodeIds.get(node.nodeId) ?? node.nodeId,
  graphSnapshotId: identity.graphSnapshotId,
  experimentId: identity.experimentId,
  revisionId: identity.revisionId,
  createdAt: node.createdAt ?? identity.createdAt,
  payload: { ...node.payload, document_uri: identity.documentUri, desktop_document_path: identity.documentPath }
}));

const buildEdges = (
  edges: readonly EditorGraphRagEdge[],
  identity: RuntimeIdentity,
  nodeIds: ReadonlyMap<string, string>
): JsonRecord[] => edges.map((edge) => {
  const fromNodeId = nodeIds.get(edge.fromNodeId) ?? edge.fromNodeId;
  const toNodeId = nodeIds.get(edge.toNodeId) ?? edge.toNodeId;
  return toJsonRecord({
    ...edge,
    edgeId: makeStableId(
      identity.graphSnapshotId,
      "edge",
      edge.edgeType,
      hashString(fromNodeId),
      hashString(toNodeId),
      hashString(edge.edgeId)
    ),
    graphSnapshotId: identity.graphSnapshotId,
    experimentId: identity.experimentId,
    fromNodeId,
    toNodeId,
    createdAt: edge.createdAt ?? identity.createdAt
  });
});

const buildCitations = (
  citations: readonly EditorGraphRagCitationCandidate[],
  identity: RuntimeIdentity
): JsonRecord[] => citations.map((candidate) => toJsonRecord({
  ...candidate,
  citationId: makeStableId(identity.revisionId, "citation", candidate.chunkId),
  revisionId: identity.revisionId,
  experimentId: identity.experimentId,
  documentUri: identity.documentUri,
  createdAt: candidate.createdAt ?? identity.createdAt,
  citation: {
    ...candidate.citation,
    experimentId: identity.experimentId,
    revisionId: identity.revisionId,
    documentUri: identity.documentUri
  },
  quality: { ...candidate.quality, desktop_document_path: identity.documentPath }
}));

const collectRuns = (input: BuildRuntimePersistencePayloadInput): readonly AgentRun[] => [
  ...(input.agentRun ? [input.agentRun] : []),
  ...(input.agentRuns ?? [])
];

const buildAgentRuns = (runs: readonly AgentRun[], identity: RuntimeIdentity): JsonRecord[] =>
  runs.map((run) => toJsonRecord({
    agentRunId: requireString(run.agentRunId, "agentRun.agentRunId"),
    experimentId: identity.experimentId,
    revisionId: identity.revisionId,
    status: run.status,
    goal: run.goal,
    auditTimeline: run.auditTimeline,
    createdAt: run.createdAt ?? identity.createdAt,
    startedAt: run.createdAt ?? identity.createdAt,
    updatedAt: run.updatedAt,
    finishedAt: TERMINAL_STATUSES.has(run.status) ? run.updatedAt ?? identity.createdAt : undefined
  }));

const buildToolCall = (toolCall: AgentToolCall, identity: RuntimeIdentity): JsonRecord =>
  toJsonRecord({
    toolCallId: requireString(toolCall.toolCallId, "toolCall.toolCallId"),
    agentRunId: requireString(toolCall.agentRunId, "toolCall.agentRunId"),
    toolName: toolCall.toolName,
    input: toolCall.payload,
    output: toolCall.result,
    payload: toolCall.payload,
    result: toolCall.result,
    status: toolCall.status,
    startedAt: toolCall.startedAt,
    finishedAt: toolCall.finishedAt,
    createdAt: toolCall.startedAt ?? identity.createdAt
  });

const buildToolCalls = (runs: readonly AgentRun[], identity: RuntimeIdentity): JsonRecord[] =>
  runs.flatMap((run) => run.toolCalls.map((toolCall) => buildToolCall(toolCall, identity)));

const getPatchStatus = (run: AgentRun, proposal: PatchProposal): "proposed" | "validated" | "rejected" | "applied" => {
  const decision = run.patchDecisions.find((item) => item.patchProposalId === proposal.patchProposalId);
  if (decision?.kind === "applied") return "applied";
  if (decision?.kind === "rejected") return "rejected";
  return run.validationResult?.status === "ok" ? "validated" : "proposed";
};

const buildPatch = (run: AgentRun, proposal: PatchProposal, identity: RuntimeIdentity): JsonRecord => {
  const appliedAt = run.patchDecisions.find((item) =>
    item.patchProposalId === proposal.patchProposalId && item.kind === "applied"
  )?.decidedAt;
  return toJsonRecord({
    patchProposalId: requireString(proposal.patchProposalId, "patchProposal.patchProposalId"),
    agentRunId: run.agentRunId,
    experimentId: identity.experimentId,
    baseRevisionId: proposal.baseRevisionId ?? identity.revisionId,
    defaultBaseRevisionId: identity.revisionId,
    patch: {
      documentId: proposal.documentId || identity.documentId,
      beforeHash: proposal.beforeHash,
      title: proposal.title,
      rationale: proposal.rationale,
      edits: proposal.edits,
      evidence: proposal.evidence
    },
    documentId: proposal.documentId || identity.documentId,
    beforeHash: proposal.beforeHash,
    title: proposal.title,
    rationale: proposal.rationale,
    edits: proposal.edits,
    evidence: proposal.evidence,
    status: getPatchStatus(run, proposal),
    validationResult: run.validationResult,
    createdAt: run.createdAt ?? identity.createdAt,
    appliedAt
  });
};

const buildPatches = (runs: readonly AgentRun[], identity: RuntimeIdentity): JsonRecord[] =>
  runs.flatMap((run) => run.patchProposals.map((proposal) => buildPatch(run, proposal, identity)));

const buildMetadata = (
  input: BuildRuntimePersistencePayloadInput,
  identity: RuntimeIdentity
): JsonRecord => toJsonRecord({
  workspaceId: identity.workspaceId,
  workspaceRootPath: input.workspace.rootPath,
  workspaceDisplayName: input.workspace.displayName,
  documentId: identity.documentId,
  documentPath: identity.documentPath,
  documentUri: identity.documentUri,
  documentName: input.document.name,
  experimentId: identity.experimentId,
  revisionId: identity.revisionId,
  graphSnapshotId: identity.graphSnapshotId,
  sourceHash: `fnv1a:${hashString(input.source)}`,
  sourceText: input.source,
  sourceLength: input.source.length
});

export const buildRuntimePersistencePayload = (
  input: BuildRuntimePersistencePayloadInput
): PersistRuntimeGraphRagPayload => {
  if (typeof input.source !== "string") {
    throw new Error("Missing required desktop runtime persistence field: source");
  }
  const identity = buildIdentity(input);
  const nodeIds = buildNodeIdMap(input.records.reactionGraphNodes, identity);
  const runs = collectRuns(input);
  const payload = {
    graphSnapshot: buildGraphSnapshot(input.records.graphSnapshot, identity, input.records.reactionGraphNodes.length, input.records.reactionGraphEdges.length),
    nodes: buildNodes(input.records.reactionGraphNodes, identity, nodeIds),
    edges: buildEdges(input.records.reactionGraphEdges, identity, nodeIds),
    citationCandidates: buildCitations(input.records.ragCitationCandidates, identity),
    agentRuns: buildAgentRuns(runs, identity),
    agentToolCalls: buildToolCalls(runs, identity),
    patchProposals: buildPatches(runs, identity),
    metadata: buildMetadata(input, identity),
    createdAt: identity.createdAt
  };
  return toJsonRecord(payload) as unknown as PersistRuntimeGraphRagPayload;
};

export const buildPersistRuntimeGraphRagCommandInput = (
  input: BuildRuntimePersistencePayloadInput
): PersistRuntimeGraphRagCommandInput => ({
  payload: buildRuntimePersistencePayload(input)
});
