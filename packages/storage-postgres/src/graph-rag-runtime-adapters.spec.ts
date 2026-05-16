import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildPostgresAgentRunRecordFromRuntime,
  buildPostgresAgentToolCallRecordFromRuntime,
  buildPostgresPatchProposalRecordFromRuntime,
  buildPostgresRuntimeGraphRagRecords,
  buildUpsertGraphSnapshotQueries
} from ".";

const createdAt = "2026-05-12T02:00:00.000Z";

const sourceRange = {
  start: 10,
  end: 40,
  startLine: 2,
  startColumn: 1,
  endLine: 5,
  endColumn: 3
};

describe("PostgreSQL Graph/RAG runtime adapters", () => {
  it("maps editor graph DTOs to graph snapshot and citation executor records", () => {
    const records = buildPostgresRuntimeGraphRagRecords({
      createdAt,
      graphSnapshot: {
        graphSnapshotId: "graph-runtime-1",
        experimentId: "exp-runtime",
        sourceRevisionIds: ["rev-runtime"],
        graphKind: "reaction"
      },
      nodes: [{
        nodeId: "node-rxn-1",
        graphSnapshotId: "graph-runtime-1",
        experimentId: "exp-runtime",
        revisionId: "rev-runtime",
        entityId: "rxn::runtime::1",
        nodeKind: "entity",
        blockId: "rxn-1",
        routeId: "route-a",
        sourceRange,
        payload: { document_uri: "file:///runtime.chemd", score: 0.9 }
      }],
      edges: [{
        edgeId: "edge-diagnostic-1",
        graphSnapshotId: "graph-runtime-1",
        experimentId: "exp-runtime",
        fromNodeId: "node-rxn-1",
        toNodeId: "node-rxn-1",
        edgeType: "diagnostic_evidence",
        confidence: "high",
        evidence: { diagnostic_code: "W_RUNTIME" }
      }],
      citationCandidates: [{
        citationId: "citation-1",
        revisionId: "rev-runtime",
        chunkId: "chunk-1",
        experimentId: "exp-runtime",
        documentUri: "file:///runtime.chemd",
        entityId: "rxn::runtime::1",
        blockId: "rxn-1",
        sourceRange,
        citation: {
          revisionId: "rev-runtime",
          chunkId: "chunk-1",
          sourceRange
        },
        quality: { range_source: "block" }
      }]
    });

    expect(records.graphSnapshotInput.graphSnapshot).toMatchObject({
      graphSnapshotId: "graph-runtime-1",
      experimentId: "exp-runtime",
      sourceRevisionIds: ["rev-runtime"],
      nodeCount: 1,
      edgeCount: 1,
      createdAt
    });
    expect(records.graphSnapshotInput.nodes?.[0]).toMatchObject({
      nodeId: "node-rxn-1",
      entityId: "rxn::runtime::1",
      blockId: "rxn-1",
      routeId: "route-a",
      sourceRange,
      payload: expect.objectContaining({
        document_uri: "file:///runtime.chemd",
        node_kind: "entity"
      })
    });
    expect(records.graphSnapshotInput.edges?.[0]).toMatchObject({
      edgeId: "edge-diagnostic-1",
      edgeType: "evidence_link",
      evidence: expect.objectContaining({
        diagnostic_code: "W_RUNTIME",
        runtime_edge_type: "diagnostic_evidence"
      })
    });
    expect(records.ragChunkCitations[0]).toMatchObject({
      revisionId: "rev-runtime",
      chunkId: "chunk-1",
      experimentId: "exp-runtime",
      entityId: "rxn::runtime::1",
      blockId: "rxn-1",
      sourceRange,
      citation: expect.objectContaining({
        experimentId: "exp-runtime",
        revisionId: "rev-runtime",
        chunkId: "chunk-1",
        entityId: "rxn::runtime::1"
      }),
      quality: expect.objectContaining({
        citation_id: "citation-1",
        document_uri: "file:///runtime.chemd",
        range_source: "block"
      }),
      createdAt
    });
  });

  it("maps Agent-style run, tool call, and patch proposal inputs", () => {
    const run = buildPostgresAgentRunRecordFromRuntime({
      agentRunId: "run-1",
      experimentId: "exp-runtime",
      revisionId: "rev-runtime",
      goal: "Repair ambiguous reaction",
      auditTimeline: [{ eventId: "event-1", type: "run_created" }],
      createdAt
    });
    const completedRun = buildPostgresAgentRunRecordFromRuntime({
      agentRunId: "run-2",
      status: "completed",
      goal: "Validate patch",
      createdAt
    });
    const toolCall = buildPostgresAgentToolCallRecordFromRuntime({
      toolCallId: "tool-1",
      agentRunId: "run-1",
      toolName: "query_rag",
      payload: { query: "yield" },
      result: { payload: { matches: 2 }, evidence: [{ chunkId: "chunk-1" }] },
      status: "ok",
      startedAt: createdAt
    });
    const patch = buildPostgresPatchProposalRecordFromRuntime({
      patchProposalId: "patch-1",
      agentRunId: "run-1",
      experimentId: "exp-runtime",
      defaultBaseRevisionId: "rev-runtime",
      documentId: "doc-1",
      beforeHash: "sha256:before",
      title: "Add kind",
      rationale: "Compiler warning",
      edits: [{ range: sourceRange, replacement: "kind: reaction" }],
      evidence: [{ summary: "diagnostic evidence" }],
      validationResult: { ok: true },
      createdAt
    });

    expect(run).toMatchObject({
      agentRunId: "run-1",
      status: "queued",
      auditTimeline: [{ eventId: "event-1", type: "run_created" }],
      startedAt: createdAt
    });
    expect(completedRun.status).toBe("succeeded");
    expect(toolCall).toMatchObject({
      toolCallId: "tool-1",
      toolName: "query_rag",
      input: { query: "yield" },
      output: expect.objectContaining({
        payload: { matches: 2 },
        evidence: [{ chunkId: "chunk-1" }]
      }),
      status: "succeeded",
      createdAt
    });
    expect(patch).toMatchObject({
      patchProposalId: "patch-1",
      baseRevisionId: "rev-runtime",
      status: "proposed",
      patch: expect.objectContaining({
        document_id: "doc-1",
        before_hash: "sha256:before",
        edits: [{ range: sourceRange, replacement: "kind: reaction" }]
      }),
      validationResult: { ok: true },
      createdAt
    });
  });

  it("keeps adapters dependency-free and emits no dedicated table names", () => {
    const sources = [
      readFileSync(
        new URL("./graph-rag-runtime-adapters.ts", import.meta.url),
        "utf8"
      ),
      readFileSync(
        new URL("./graph-rag-runtime-types.ts", import.meta.url),
        "utf8"
      )
    ].join("\n");
    const records = buildPostgresRuntimeGraphRagRecords({
      createdAt,
      graphSnapshot: {
        graphSnapshotId: "graph-runtime-1",
        experimentId: "exp-runtime",
        sourceRevisionIds: ["rev-runtime"],
        graphKind: "reaction"
      }
    });
    const sql = buildUpsertGraphSnapshotQueries(records.graphSnapshotInput)
      .map((query) => query.sql)
      .join("\n");

    expect(sources).not.toContain("@chemd/language-service");
    expect(sources).not.toContain("@chemd/agent-tools");
    expect(sql).not.toContain("desktop_");
    expect(sql).not.toContain("chemd_desktop_");
    expect(sql).toContain("chemd_reaction_graph_snapshots");
  });

  it("requires a base revision before emitting patch proposal records", () => {
    expect(() =>
      buildPostgresPatchProposalRecordFromRuntime({
        patchProposalId: "patch-without-base",
        experimentId: "exp-runtime",
        patch: { edits: [] },
        createdAt
      })
    ).toThrow("Missing base revision");
  });
});
