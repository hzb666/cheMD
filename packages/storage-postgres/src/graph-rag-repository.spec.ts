import { describe, expect, it } from "vitest";

import {
  buildListGraphSnapshotSummariesQuery,
  buildListPendingPatchProposalsQuery,
  buildLoadGraphDetailQueries,
  buildRecordAgentRunQuery,
  buildRecordAgentToolCallQuery,
  buildRecordPatchProposalQuery,
  buildUpsertGraphSnapshotQueries,
  buildUpsertRagChunkCitationQuery,
  type PostgresGraphRagQuery,
  type PostgresRagChunkCitationRecord,
  type PostgresReactionGraphEdgeRecord,
  type PostgresReactionGraphNodeRecord,
  type PostgresReactionGraphSnapshotRecord
} from ".";

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

const assertNoDesktopOnlyTables = (queries: readonly PostgresGraphRagQuery[]): void => {
  const sql = queries.map((item) => item.sql).join("\n");
  expect(sql).not.toContain("desktop_");
  expect(sql).not.toContain("chemd_desktop_");
};

describe("PostgreSQL Graph/RAG repository query builders", () => {
  it("builds a graph snapshot upsert plan with deterministic parameter order", () => {
    const queries = buildUpsertGraphSnapshotQueries({
      graphSnapshot: snapshot,
      nodes: [node],
      edges: [edge]
    });

    expect(queries).toHaveLength(5);
    expect(queries[0]?.sql).toContain("INSERT INTO chemd_reaction_graph_snapshots");
    expect(queries[0]?.sql).toContain("ON CONFLICT (graph_snapshot_id)");
    expect(queries[0]?.values).toEqual([
      "graph-1",
      "exp-1",
      JSON.stringify(["rev-1"]),
      "reaction",
      1,
      1,
      createdAt
    ]);
    expect(queries[1]?.sql).toContain("DELETE FROM chemd_reaction_graph_edges");
    expect(queries[1]?.values).toEqual(["graph-1", ["edge-1"]]);
    expect(queries[2]?.sql).toContain("DELETE FROM chemd_reaction_graph_nodes");
    expect(queries[2]?.values).toEqual(["graph-1", ["node-1"]]);
    expect(queries[3]?.values).toEqual([
      "node-1",
      "graph-1",
      "exp-1",
      "rev-1",
      "rxn-1",
      "block-1",
      "reduction",
      "route-a",
      JSON.stringify({ start: 1, end: 10 }),
      JSON.stringify({ route: "route-a" }),
      createdAt
    ]);
    expect(queries[4]?.values).toEqual([
      "edge-1",
      "graph-1",
      "exp-1",
      "node-1",
      "node-2",
      "semantic_similarity",
      "high",
      JSON.stringify({ score: 0.95 }),
      createdAt
    ]);
    assertNoDesktopOnlyTables(queries);
  });

  it("builds list and detail queries without interpolating caller input", () => {
    const maliciousExperimentId = "exp-1'; DROP TABLE chemd_experiments; --";
    const summary = buildListGraphSnapshotSummariesQuery({
      experimentId: maliciousExperimentId,
      graphKind: "reaction",
      limit: 10
    });
    const detail = buildLoadGraphDetailQueries({ graphSnapshotId: "graph-1" });

    expect(summary.sql).toContain("experiment_id = $1");
    expect(summary.sql).toContain("graph_kind = $2");
    expect(summary.sql).toContain("LIMIT $3");
    expect(summary.sql).not.toContain(maliciousExperimentId);
    expect(summary.values).toEqual([maliciousExperimentId, "reaction", 10]);
    expect(detail.snapshot.values).toEqual(["graph-1"]);
    expect(detail.nodes.sql).toContain("FROM chemd_reaction_graph_nodes");
    expect(detail.edges.sql).toContain("FROM chemd_reaction_graph_edges");
    assertNoDesktopOnlyTables([summary, detail.snapshot, detail.nodes, detail.edges]);
  });

  it("builds RAG citation and Agent audit upserts against shared tables", () => {
    const citationQuery = buildUpsertRagChunkCitationQuery(citation);
    const runQuery = buildRecordAgentRunQuery({
      agentRunId: "agent-run-1",
      experimentId: "exp-1",
      revisionId: "rev-1",
      status: "succeeded",
      goal: "Review graph",
      startedAt: createdAt,
      finishedAt: createdAt
    });
    const toolCallQuery = buildRecordAgentToolCallQuery({
      toolCallId: "tool-call-1",
      agentRunId: "agent-run-1",
      toolName: "load_graph",
      input: { graphSnapshotId: "graph-1" },
      output: { nodeCount: 1 },
      status: "succeeded",
      createdAt
    });
    const patchQuery = buildRecordPatchProposalQuery({
      patchProposalId: "patch-1",
      agentRunId: "agent-run-1",
      experimentId: "exp-1",
      baseRevisionId: "rev-1",
      patch: { edits: [] },
      status: "proposed",
      validationResult: { diagnostics: [] },
      createdAt
    });

    expect(citationQuery.sql).toContain("ON CONFLICT (revision_id, chunk_id)");
    expect(citationQuery.values).toEqual([
      "rev-1",
      "chunk-1",
      "exp-1",
      "rxn-1",
      "block-1",
      JSON.stringify({ startLine: 3, endLine: 8 }),
      JSON.stringify(citation.citation),
      JSON.stringify({ rag_eligible: true }),
      createdAt
    ]);
    expect(runQuery.values).toEqual([
      "agent-run-1",
      "exp-1",
      "rev-1",
      "succeeded",
      "Review graph",
      createdAt,
      createdAt
    ]);
    expect(toolCallQuery.values[3]).toBe(JSON.stringify({ graphSnapshotId: "graph-1" }));
    expect(toolCallQuery.values[4]).toBe(JSON.stringify({ nodeCount: 1 }));
    expect(patchQuery.values).toEqual([
      "patch-1",
      "agent-run-1",
      "exp-1",
      "rev-1",
      JSON.stringify({ edits: [] }),
      "proposed",
      JSON.stringify({ diagnostics: [] }),
      createdAt,
      undefined
    ]);
    assertNoDesktopOnlyTables([citationQuery, runQuery, toolCallQuery, patchQuery]);
  });

  it("builds pending patch proposal queries with bounded shared-model filters", () => {
    const pending = buildListPendingPatchProposalsQuery({
      experimentId: "exp-1",
      baseRevisionId: "rev-1",
      limit: 25
    });

    expect(pending.sql).toContain("FROM chemd_patch_proposals");
    expect(pending.sql).toContain("status = $1");
    expect(pending.sql).toContain("experiment_id = $2");
    expect(pending.sql).toContain("base_revision_id = $3");
    expect(pending.sql).toContain("LIMIT $4");
    expect(pending.values).toEqual(["proposed", "exp-1", "rev-1", 25]);
    assertNoDesktopOnlyTables([pending]);
  });

  it("rejects invalid list limits before query execution", () => {
    expect(() => buildListGraphSnapshotSummariesQuery({ limit: 0 })).toThrow(
      "limit must be a positive integer"
    );
    expect(() => buildListPendingPatchProposalsQuery({ limit: 1.5 })).toThrow(
      "limit must be a positive integer"
    );
  });
});
