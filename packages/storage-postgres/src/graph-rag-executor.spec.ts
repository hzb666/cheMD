import { describe, expect, it } from "vitest";

import {
  executeUpsertGraphSnapshotTransactionPlan,
  listPendingPostgresPatchProposals,
  listPostgresGraphSnapshotSummaries,
  loadPostgresGraphDetail,
  mapPostgresGraphNodeRow,
  recordPostgresAgentRun,
  recordPostgresAgentToolCall,
  recordPostgresPatchProposal,
  upsertPostgresRagChunkCitation,
  type PostgresGraphRagClient,
  type PostgresRagChunkCitationRecord,
  type PostgresReactionGraphEdgeRecord,
  type PostgresReactionGraphNodeRecord,
  type PostgresReactionGraphSnapshotRecord
} from ".";

type QueryCall = { sql: string; values?: readonly unknown[] };
type QueryResult = { rows: unknown[] };
type GraphNodeRow = Parameters<typeof mapPostgresGraphNodeRow>[0];

const createdAt = "2026-05-12T00:00:00.000Z";
const snapshot: PostgresReactionGraphSnapshotRecord = {
  graphSnapshotId: "graph-1",
  experimentId: "exp-1",
  sourceRevisionIds: ["rev-1"],
  graphKind: "reaction",
  nodeCount: 1,
  edgeCount: 1,
  createdAt
};

const node: PostgresReactionGraphNodeRecord = {
  nodeId: "node-1",
  graphSnapshotId: "graph-1",
  experimentId: "exp-1",
  revisionId: "rev-1",
  entityId: "rxn-1",
  blockId: "block-1",
  reactionFamily: "reduction",
  routeId: "route-a",
  sourceRange: { start: 1, end: 10 },
  payload: { route: "route-a" },
  createdAt
};

const edge: PostgresReactionGraphEdgeRecord = {
  edgeId: "edge-1",
  graphSnapshotId: "graph-1",
  experimentId: "exp-1",
  fromNodeId: "node-1",
  toNodeId: "node-2",
  edgeType: "semantic_similarity",
  confidence: "high",
  evidence: { score: 0.95 },
  createdAt
};

const citation: PostgresRagChunkCitationRecord = {
  revisionId: "rev-1",
  chunkId: "chunk-1",
  experimentId: "exp-1",
  entityId: "rxn-1",
  blockId: "block-1",
  sourceRange: { startLine: 3, endLine: 8 },
  citation: {
    experimentId: "exp-1",
    revisionId: "rev-1",
    chunkId: "chunk-1",
    entityId: "rxn-1",
    sourceRange: { startLine: 3, endLine: 8 }
  },
  quality: { rag_eligible: true },
  createdAt
};

const createClient = (
  results: QueryResult[] = [],
  failOnSql?: string
): PostgresGraphRagClient & { calls: QueryCall[] } => {
  const calls: QueryCall[] = [];
  return {
    calls,
    async query(sql: string, values?: readonly unknown[]): Promise<unknown> {
      calls.push({ sql, values });
      if (failOnSql && sql.includes(failOnSql)) {
        throw new Error(`failed on ${failOnSql}`);
      }
      return results.shift() ?? { rows: [] };
    }
  };
};

const sqlCalls = (calls: readonly QueryCall[]): string[] =>
  calls.map((call) => call.sql);

const assertNoDesktopOnlyTables = (calls: readonly QueryCall[]): void => {
  const sql = sqlCalls(calls).join("\n");
  expect(sql).not.toContain("desktop_");
  expect(sql).not.toContain("chemd_desktop_");
};

const snapshotRow = (created: unknown = createdAt): unknown => ({
  graph_snapshot_id: "graph-1",
  experiment_id: "exp-1",
  source_revision_ids: ["rev-1"],
  graph_kind: "reaction",
  node_count: 1,
  edge_count: 1,
  created_at: created
});

const nodeRow = (sourceRange: unknown = { start: 1, end: 10 }): GraphNodeRow => ({
  node_id: "node-1",
  graph_snapshot_id: "graph-1",
  experiment_id: "exp-1",
  revision_id: "rev-1",
  entity_id: "rxn-1",
  block_id: null,
  reaction_family: "reduction",
  route_id: "route-a",
  source_range: sourceRange,
  payload: { route: "route-a" },
  created_at: createdAt
});

const edgeRow = (evidence: unknown = { score: 0.95 }): unknown => ({
  edge_id: "edge-1",
  graph_snapshot_id: "graph-1",
  experiment_id: "exp-1",
  from_node_id: "node-1",
  to_node_id: "node-2",
  edge_type: "semantic_similarity",
  confidence: "high",
  evidence,
  created_at: createdAt
});

describe("PostgreSQL Graph/RAG executor helpers", () => {
  it("executes graph snapshot upsert plans inside begin/commit in order", async () => {
    const client = createClient();

    await executeUpsertGraphSnapshotTransactionPlan(client, {
      graphSnapshot: snapshot,
      nodes: [node],
      edges: [edge]
    });

    expect(sqlCalls(client.calls)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO chemd_reaction_graph_snapshots"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_edges"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_edges"),
      "COMMIT"
    ]);
    expect(client.calls[4]?.values?.slice(0, 5)).toEqual([
      "node-1",
      "graph-1",
      "exp-1",
      "rev-1",
      "rxn-1"
    ]);
    expect(client.calls[4]?.values?.[8]).toBe(JSON.stringify({ start: 1, end: 10 }));
    assertNoDesktopOnlyTables(client.calls);
  });

  it("rolls back graph snapshot transactions and rethrows the failure", async () => {
    const client = createClient([], "INSERT INTO chemd_reaction_graph_nodes");

    await expect(
      executeUpsertGraphSnapshotTransactionPlan(client, {
        graphSnapshot: snapshot,
        nodes: [node],
        edges: [edge]
      })
    ).rejects.toThrow("failed on INSERT INTO chemd_reaction_graph_nodes");

    expect(sqlCalls(client.calls)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO chemd_reaction_graph_snapshots"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_edges"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_nodes"),
      "ROLLBACK"
    ]);
    expect(sqlCalls(client.calls)).not.toContain("COMMIT");
  });

  it("maps list and detail rows from snake_case SQL results", async () => {
    const client = createClient([
      { rows: [snapshotRow(new Date(createdAt))] },
      { rows: [snapshotRow()] },
      { rows: [nodeRow("{\"start\":1,\"end\":10}")] },
      { rows: [edgeRow("{\"score\":0.95}")] }
    ]);

    const summaries = await listPostgresGraphSnapshotSummaries(client, {
      experimentId: "exp-1",
      limit: 5
    });
    const detail = await loadPostgresGraphDetail(client, { graphSnapshotId: "graph-1" });

    expect(summaries[0]).toEqual(snapshot);
    expect(detail).toEqual({
      snapshot,
      nodes: [{ ...node, blockId: undefined }],
      edges: [edge]
    });
    expect(client.calls[0]?.values).toEqual(["exp-1", 5]);
    expect(sqlCalls(client.calls).slice(1)).toEqual([
      expect.stringContaining("FROM chemd_reaction_graph_snapshots"),
      expect.stringContaining("FROM chemd_reaction_graph_nodes"),
      expect.stringContaining("FROM chemd_reaction_graph_edges")
    ]);
    assertNoDesktopOnlyTables(client.calls);
  });

  it("executes citation and agent audit upserts against shared tables", async () => {
    const client = createClient();

    await upsertPostgresRagChunkCitation(client, citation);
    await recordPostgresAgentRun(client, {
      agentRunId: "agent-run-1",
      experimentId: "exp-1",
      revisionId: "rev-1",
      status: "succeeded",
      goal: "Review graph",
      auditTimeline: [{ event_id: "event-1", type: "run_created" }],
      startedAt: createdAt,
      finishedAt: createdAt
    });
    await recordPostgresAgentToolCall(client, {
      toolCallId: "tool-call-1",
      agentRunId: "agent-run-1",
      toolName: "load_graph",
      input: { graphSnapshotId: "graph-1" },
      output: { nodeCount: 1 },
      status: "succeeded",
      createdAt
    });
    await recordPostgresPatchProposal(client, {
      patchProposalId: "patch-1",
      agentRunId: "agent-run-1",
      experimentId: "exp-1",
      baseRevisionId: "rev-1",
      patch: { edits: [] },
      status: "proposed",
      createdAt
    });

    expect(sqlCalls(client.calls)).toEqual([
      expect.stringContaining("INSERT INTO chemd_rag_chunk_citations"),
      expect.stringContaining("INSERT INTO chemd_agent_runs"),
      expect.stringContaining("INSERT INTO chemd_agent_tool_calls"),
      expect.stringContaining("INSERT INTO chemd_patch_proposals")
    ]);
    expect(client.calls[2]?.values?.[3]).toBe(JSON.stringify({ graphSnapshotId: "graph-1" }));
    expect(client.calls[3]?.values?.[4]).toBe(JSON.stringify({ edits: [] }));
    assertNoDesktopOnlyTables(client.calls);
  });

  it("lists pending patch proposals and maps jsonb fields", async () => {
    const client = createClient([{
      rows: [{
        patch_proposal_id: "patch-1",
        agent_run_id: "agent-run-1",
        experiment_id: "exp-1",
        base_revision_id: "rev-1",
        patch: "{\"edits\":[]}",
        status: "proposed",
        validation_result: { diagnostics: [] },
        created_at: createdAt,
        applied_at: null
      }]
    }]);

    const proposals = await listPendingPostgresPatchProposals(client, {
      experimentId: "exp-1",
      baseRevisionId: "rev-1",
      limit: 10
    });

    expect(proposals[0]).toMatchObject({
      patchProposalId: "patch-1",
      agentRunId: "agent-run-1",
      patch: { edits: [] },
      validationResult: { diagnostics: [] }
    });
    expect(client.calls[0]?.values).toEqual(["proposed", "exp-1", "rev-1", 10]);
    assertNoDesktopOnlyTables(client.calls);
  });

  it("rejects invalid jsonb row shapes before returning domain records", () => {
    expect(() => mapPostgresGraphNodeRow(nodeRow("not-json")))
      .toThrow("source_range must be a JSON object");
  });
});
