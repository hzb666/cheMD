import type {
  PostgresGraphDetail,
  PostgresPatchProposalRecord,
  PostgresReactionGraphEdgeRecord,
  PostgresReactionGraphNodeRecord,
  PostgresReactionGraphSnapshotRecord,
  PostgresSourceRangeRecord
} from "./graph-rag-types";
import type { JsonRecord } from "./types";

export interface RowsResult<Row> {
  rows: Row[];
}

type GraphSnapshotRow = {
  graph_snapshot_id: unknown;
  experiment_id: unknown;
  source_revision_ids: unknown;
  graph_kind: unknown;
  node_count: unknown;
  edge_count: unknown;
  created_at: unknown;
};

type GraphNodeRow = {
  node_id: unknown;
  graph_snapshot_id: unknown;
  experiment_id: unknown;
  revision_id: unknown;
  entity_id: unknown;
  block_id?: unknown;
  reaction_family?: unknown;
  route_id?: unknown;
  source_range: unknown;
  payload: unknown;
  created_at: unknown;
};

type GraphEdgeRow = {
  edge_id: unknown;
  graph_snapshot_id: unknown;
  experiment_id: unknown;
  from_node_id: unknown;
  to_node_id: unknown;
  edge_type: unknown;
  confidence: unknown;
  evidence: unknown;
  created_at: unknown;
};

type PatchProposalRow = {
  patch_proposal_id: unknown;
  agent_run_id?: unknown;
  experiment_id: unknown;
  base_revision_id: unknown;
  patch: unknown;
  status: unknown;
  validation_result?: unknown;
  created_at: unknown;
  applied_at?: unknown;
};

const isRowsResult = <Row>(value: unknown): value is RowsResult<Row> =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { rows?: unknown }).rows);

export const readPostgresGraphRagRows = <Row>(result: unknown): Row[] => {
  if (!isRowsResult<Row>(result)) {
    throw new TypeError("Postgres query result must include rows");
  }
  return result.rows;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${field} must be a string`);
  }
  return value;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return requireString(value, field);
};

const requireNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }
  return value;
};

const parseJsonb = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const requireStringArray = (value: unknown, field: string): string[] => {
  const parsed = parseJsonb(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new TypeError(`${field} must be a string array`);
  }
  return parsed;
};

const requireTimestamp = (value: unknown, field: string): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return requireString(value, field);
};

const optionalTimestamp = (value: unknown, field: string): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return requireTimestamp(value, field);
};

const requireJsonRecord = (value: unknown, field: string): JsonRecord => {
  const parsed = parseJsonb(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError(`${field} must be a JSON object`);
  }
  return parsed as JsonRecord;
};

const optionalJsonRecord = (
  value: unknown,
  field: string
): JsonRecord | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  return requireJsonRecord(value, field);
};

const requireGraphKind = (
  value: unknown
): PostgresReactionGraphSnapshotRecord["graphKind"] => {
  const graphKind = requireString(value, "graph_kind");
  if (graphKind !== "reaction" && graphKind !== "rag_context" && graphKind !== "agent_audit") {
    throw new TypeError(`unsupported graph_kind: ${graphKind}`);
  }
  return graphKind;
};

const requireConfidence = (
  value: unknown
): PostgresReactionGraphEdgeRecord["confidence"] => {
  const confidence = requireString(value, "confidence");
  if (
    confidence !== "low" &&
    confidence !== "medium" &&
    confidence !== "high" &&
    confidence !== "unknown"
  ) {
    throw new TypeError(`unsupported confidence: ${confidence}`);
  }
  return confidence;
};

export const mapPostgresGraphSnapshotRow = (
  row: GraphSnapshotRow
): PostgresReactionGraphSnapshotRecord => ({
  graphSnapshotId: requireString(row.graph_snapshot_id, "graph_snapshot_id"),
  experimentId: requireString(row.experiment_id, "experiment_id"),
  sourceRevisionIds: requireStringArray(row.source_revision_ids, "source_revision_ids"),
  graphKind: requireGraphKind(row.graph_kind),
  nodeCount: requireNumber(row.node_count, "node_count"),
  edgeCount: requireNumber(row.edge_count, "edge_count"),
  createdAt: requireTimestamp(row.created_at, "created_at")
});

export const mapPostgresGraphNodeRow = (
  row: GraphNodeRow
): PostgresReactionGraphNodeRecord => ({
  nodeId: requireString(row.node_id, "node_id"),
  graphSnapshotId: requireString(row.graph_snapshot_id, "graph_snapshot_id"),
  experimentId: requireString(row.experiment_id, "experiment_id"),
  revisionId: requireString(row.revision_id, "revision_id"),
  entityId: requireString(row.entity_id, "entity_id"),
  blockId: optionalString(row.block_id, "block_id"),
  reactionFamily: optionalString(row.reaction_family, "reaction_family"),
  routeId: optionalString(row.route_id, "route_id"),
  sourceRange: requireJsonRecord(row.source_range, "source_range") as PostgresSourceRangeRecord,
  payload: requireJsonRecord(row.payload, "payload"),
  createdAt: requireTimestamp(row.created_at, "created_at")
});

export const mapPostgresGraphEdgeRow = (
  row: GraphEdgeRow
): PostgresReactionGraphEdgeRecord => ({
  edgeId: requireString(row.edge_id, "edge_id"),
  graphSnapshotId: requireString(row.graph_snapshot_id, "graph_snapshot_id"),
  experimentId: requireString(row.experiment_id, "experiment_id"),
  fromNodeId: requireString(row.from_node_id, "from_node_id"),
  toNodeId: requireString(row.to_node_id, "to_node_id"),
  edgeType: requireString(row.edge_type, "edge_type") as PostgresReactionGraphEdgeRecord["edgeType"],
  confidence: requireConfidence(row.confidence),
  evidence: requireJsonRecord(row.evidence, "evidence"),
  createdAt: requireTimestamp(row.created_at, "created_at")
});

export const mapPostgresPatchProposalRow = (
  row: PatchProposalRow
): PostgresPatchProposalRecord => ({
  patchProposalId: requireString(row.patch_proposal_id, "patch_proposal_id"),
  agentRunId: optionalString(row.agent_run_id, "agent_run_id"),
  experimentId: requireString(row.experiment_id, "experiment_id"),
  baseRevisionId: requireString(row.base_revision_id, "base_revision_id"),
  patch: requireJsonRecord(row.patch, "patch"),
  status: requireString(row.status, "status") as PostgresPatchProposalRecord["status"],
  validationResult: optionalJsonRecord(row.validation_result, "validation_result"),
  createdAt: requireTimestamp(row.created_at, "created_at"),
  appliedAt: optionalTimestamp(row.applied_at, "applied_at")
});

export const mapPostgresGraphDetailRows = (
  snapshotRows: readonly GraphSnapshotRow[],
  nodeRows: readonly GraphNodeRow[],
  edgeRows: readonly GraphEdgeRow[]
): PostgresGraphDetail => ({
  snapshot: snapshotRows[0] ? mapPostgresGraphSnapshotRow(snapshotRows[0]) : undefined,
  nodes: nodeRows.map(mapPostgresGraphNodeRow),
  edges: edgeRows.map(mapPostgresGraphEdgeRow)
});
