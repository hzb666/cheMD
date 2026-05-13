import type {
  ListPendingPostgresPatchProposalsInput,
  ListPostgresGraphSnapshotSummariesInput,
  LoadPostgresGraphDetailInput,
  PostgresGraphDetailQueries,
  PostgresGraphRagQuery
} from "./graph-rag-types";
import {
  clampGraphRagListLimit,
  graphRagWhereClause,
  pushGraphRagFilter,
  query
} from "./graph-rag-repository-shared";

export const buildListGraphSnapshotSummariesQuery = (
  input: ListPostgresGraphSnapshotSummariesInput = {}
): PostgresGraphRagQuery => {
  const values: unknown[] = [];
  const clauses: string[] = [];
  pushGraphRagFilter(clauses, values, "experiment_id", input.experimentId);
  pushGraphRagFilter(clauses, values, "graph_kind", input.graphKind);
  values.push(clampGraphRagListLimit(input.limit));
  return query(`
SELECT graph_snapshot_id, experiment_id, source_revision_ids, graph_kind,
  node_count, edge_count, created_at
FROM chemd_reaction_graph_snapshots
${graphRagWhereClause(clauses)}
ORDER BY created_at DESC, graph_snapshot_id ASC
LIMIT $${values.length}`, values);
};

export const buildLoadGraphDetailQueries = (
  input: LoadPostgresGraphDetailInput
): PostgresGraphDetailQueries => ({
  snapshot: query(`
SELECT graph_snapshot_id, experiment_id, source_revision_ids, graph_kind,
  node_count, edge_count, created_at
FROM chemd_reaction_graph_snapshots
WHERE graph_snapshot_id = $1`, [input.graphSnapshotId]),
  nodes: query(`
SELECT node_id, graph_snapshot_id, experiment_id, revision_id, entity_id,
  block_id, reaction_family, route_id, source_range, payload, created_at
FROM chemd_reaction_graph_nodes
WHERE graph_snapshot_id = $1
ORDER BY node_id ASC`, [input.graphSnapshotId]),
  edges: query(`
SELECT edge_id, graph_snapshot_id, experiment_id, from_node_id, to_node_id,
  edge_type, confidence, evidence, created_at
FROM chemd_reaction_graph_edges
WHERE graph_snapshot_id = $1
ORDER BY edge_id ASC`, [input.graphSnapshotId])
});

export const buildListPendingPatchProposalsQuery = (
  input: ListPendingPostgresPatchProposalsInput = {}
): PostgresGraphRagQuery => {
  const values: unknown[] = ["proposed"];
  const clauses = ["status = $1"];
  pushGraphRagFilter(clauses, values, "experiment_id", input.experimentId);
  pushGraphRagFilter(clauses, values, "base_revision_id", input.baseRevisionId);
  values.push(clampGraphRagListLimit(input.limit));
  return query(`
SELECT patch_proposal_id, agent_run_id, experiment_id, base_revision_id,
  patch, status, validation_result, created_at, applied_at
FROM chemd_patch_proposals
${graphRagWhereClause(clauses)}
ORDER BY created_at ASC, patch_proposal_id ASC
LIMIT $${values.length}`, values);
};
