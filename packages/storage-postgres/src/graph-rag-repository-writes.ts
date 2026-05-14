import type {
  PostgresAgentRunRecord,
  PostgresAgentToolCallRecord,
  PostgresGraphRagQuery,
  PostgresPatchProposalRecord,
  PostgresRagChunkCitationRecord,
  PostgresReactionGraphEdgeRecord,
  PostgresReactionGraphNodeRecord,
  PostgresReactionGraphSnapshotRecord,
  UpsertPostgresGraphSnapshotInput
} from "./graph-rag-types";
import { query, toJsonParam } from "./graph-rag-repository-shared";

export const buildUpsertGraphSnapshotQuery = (
  record: PostgresReactionGraphSnapshotRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_reaction_graph_snapshots (
  graph_snapshot_id, experiment_id, source_revision_ids, graph_kind,
  node_count, edge_count, created_at
) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
ON CONFLICT (graph_snapshot_id) DO UPDATE SET
  experiment_id = EXCLUDED.experiment_id,
  source_revision_ids = EXCLUDED.source_revision_ids,
  graph_kind = EXCLUDED.graph_kind,
  node_count = EXCLUDED.node_count,
  edge_count = EXCLUDED.edge_count,
  created_at = EXCLUDED.created_at`, [
  record.graphSnapshotId,
  record.experimentId,
  JSON.stringify(record.sourceRevisionIds),
  record.graphKind,
  record.nodeCount,
  record.edgeCount,
  record.createdAt
]);

const buildDeleteMissingGraphEdgesQuery = (
  graphSnapshotId: string,
  edges: readonly PostgresReactionGraphEdgeRecord[]
): PostgresGraphRagQuery => query(`
DELETE FROM chemd_reaction_graph_edges
WHERE graph_snapshot_id = $1
  AND NOT (edge_id = ANY($2::text[]))`, [
  graphSnapshotId,
  edges.map((edge) => edge.edgeId)
]);

const buildDeleteMissingGraphNodesQuery = (
  graphSnapshotId: string,
  nodes: readonly PostgresReactionGraphNodeRecord[]
): PostgresGraphRagQuery => query(`
DELETE FROM chemd_reaction_graph_nodes
WHERE graph_snapshot_id = $1
  AND NOT (node_id = ANY($2::text[]))`, [
  graphSnapshotId,
  nodes.map((node) => node.nodeId)
]);

export const buildUpsertGraphNodeQuery = (
  record: PostgresReactionGraphNodeRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_reaction_graph_nodes (
  node_id, graph_snapshot_id, experiment_id, revision_id, entity_id, block_id,
  reaction_family, route_id, source_range, payload, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11)
ON CONFLICT (node_id) DO UPDATE SET
  graph_snapshot_id = EXCLUDED.graph_snapshot_id,
  experiment_id = EXCLUDED.experiment_id,
  revision_id = EXCLUDED.revision_id,
  entity_id = EXCLUDED.entity_id,
  block_id = EXCLUDED.block_id,
  reaction_family = EXCLUDED.reaction_family,
  route_id = EXCLUDED.route_id,
  source_range = EXCLUDED.source_range,
  payload = EXCLUDED.payload,
  created_at = EXCLUDED.created_at`, [
  record.nodeId,
  record.graphSnapshotId,
  record.experimentId,
  record.revisionId,
  record.entityId,
  record.blockId,
  record.reactionFamily,
  record.routeId,
  toJsonParam(record.sourceRange),
  toJsonParam(record.payload),
  record.createdAt
]);

export const buildUpsertGraphEdgeQuery = (
  record: PostgresReactionGraphEdgeRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_reaction_graph_edges (
  edge_id, graph_snapshot_id, experiment_id, from_node_id, to_node_id,
  edge_type, confidence, evidence, created_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
ON CONFLICT (edge_id) DO UPDATE SET
  graph_snapshot_id = EXCLUDED.graph_snapshot_id,
  experiment_id = EXCLUDED.experiment_id,
  from_node_id = EXCLUDED.from_node_id,
  to_node_id = EXCLUDED.to_node_id,
  edge_type = EXCLUDED.edge_type,
  confidence = EXCLUDED.confidence,
  evidence = EXCLUDED.evidence,
  created_at = EXCLUDED.created_at`, [
  record.edgeId,
  record.graphSnapshotId,
  record.experimentId,
  record.fromNodeId,
  record.toNodeId,
  record.edgeType,
  record.confidence,
  toJsonParam(record.evidence),
  record.createdAt
]);

export const buildUpsertGraphSnapshotQueries = (
  input: UpsertPostgresGraphSnapshotInput
): PostgresGraphRagQuery[] => {
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];
  return [
    buildUpsertGraphSnapshotQuery(input.graphSnapshot),
    buildDeleteMissingGraphEdgesQuery(input.graphSnapshot.graphSnapshotId, edges),
    buildDeleteMissingGraphNodesQuery(input.graphSnapshot.graphSnapshotId, nodes),
    ...nodes.map(buildUpsertGraphNodeQuery),
    ...edges.map(buildUpsertGraphEdgeQuery)
  ];
};

export const buildUpsertRagChunkCitationQuery = (
  record: PostgresRagChunkCitationRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_rag_chunk_citations (
  revision_id, chunk_id, experiment_id, entity_id, block_id, source_range,
  citation, quality, created_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9)
ON CONFLICT (revision_id, chunk_id) DO UPDATE SET
  experiment_id = EXCLUDED.experiment_id,
  entity_id = EXCLUDED.entity_id,
  block_id = EXCLUDED.block_id,
  source_range = EXCLUDED.source_range,
  citation = EXCLUDED.citation,
  quality = EXCLUDED.quality,
  created_at = EXCLUDED.created_at`, [
  record.revisionId,
  record.chunkId,
  record.experimentId,
  record.entityId,
  record.blockId,
  toJsonParam(record.sourceRange),
  toJsonParam(record.citation),
  toJsonParam(record.quality),
  record.createdAt
]);

export const buildRecordAgentRunQuery = (
  record: PostgresAgentRunRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_agent_runs (
  agent_run_id, experiment_id, revision_id, status, goal, started_at,
  finished_at, audit_timeline
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
ON CONFLICT (agent_run_id) DO UPDATE SET
  experiment_id = EXCLUDED.experiment_id,
  revision_id = EXCLUDED.revision_id,
  status = EXCLUDED.status,
  goal = EXCLUDED.goal,
  started_at = EXCLUDED.started_at,
  finished_at = EXCLUDED.finished_at,
  audit_timeline = EXCLUDED.audit_timeline`, [
  record.agentRunId,
  record.experimentId,
  record.revisionId,
  record.status,
  record.goal,
  record.startedAt,
  record.finishedAt,
  toJsonParam(record.auditTimeline)
]);

export const buildRecordAgentToolCallQuery = (
  record: PostgresAgentToolCallRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_agent_tool_calls (
  tool_call_id, agent_run_id, tool_name, input, output, status, created_at
) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
ON CONFLICT (tool_call_id) DO UPDATE SET
  agent_run_id = EXCLUDED.agent_run_id,
  tool_name = EXCLUDED.tool_name,
  input = EXCLUDED.input,
  output = EXCLUDED.output,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at`, [
  record.toolCallId,
  record.agentRunId,
  record.toolName,
  toJsonParam(record.input),
  toJsonParam(record.output),
  record.status,
  record.createdAt
]);

export const buildRecordPatchProposalQuery = (
  record: PostgresPatchProposalRecord
): PostgresGraphRagQuery => query(`
INSERT INTO chemd_patch_proposals (
  patch_proposal_id, agent_run_id, experiment_id, base_revision_id, patch,
  status, validation_result, created_at, applied_at
) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9)
ON CONFLICT (patch_proposal_id) DO UPDATE SET
  agent_run_id = EXCLUDED.agent_run_id,
  experiment_id = EXCLUDED.experiment_id,
  base_revision_id = EXCLUDED.base_revision_id,
  patch = EXCLUDED.patch,
  status = EXCLUDED.status,
  validation_result = EXCLUDED.validation_result,
  created_at = EXCLUDED.created_at,
  applied_at = EXCLUDED.applied_at`, [
  record.patchProposalId,
  record.agentRunId,
  record.experimentId,
  record.baseRevisionId,
  toJsonParam(record.patch),
  record.status,
  toJsonParam(record.validationResult),
  record.createdAt,
  record.appliedAt
]);
