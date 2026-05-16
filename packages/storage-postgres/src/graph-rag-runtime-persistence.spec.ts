import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildPostgresRuntimeGraphRagRecords,
  persistPostgresRuntimeGraphRagRecords,
  type PostgresGraphRagClient,
  type PostgresRuntimeGraphRagRecords
} from ".";

type QueryCall = { sql: string; values?: readonly unknown[] };
type QueryResult = { rows: unknown[] };

const createdAt = "2026-05-12T03:00:00.000Z";
const sourceRange = { start: 1, end: 12, startLine: 1, endLine: 3 };

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

const buildRuntimeRecords = (): PostgresRuntimeGraphRagRecords =>
  buildPostgresRuntimeGraphRagRecords({
    createdAt,
    graphSnapshot: {
      graphSnapshotId: "graph-runtime-1",
      experimentId: "exp-runtime",
      sourceRevisionIds: ["rev-runtime"],
      graphKind: "reaction"
    },
    nodes: [{
      nodeId: "node-runtime-1",
      graphSnapshotId: "graph-runtime-1",
      experimentId: "exp-runtime",
      revisionId: "rev-runtime",
      entityId: "rxn-runtime-1",
      blockId: "rxn-1",
      nodeKind: "entity",
      sourceRange,
      payload: { route: "route-a" }
    }],
    edges: [{
      edgeId: "edge-runtime-1",
      graphSnapshotId: "graph-runtime-1",
      experimentId: "exp-runtime",
      fromNodeId: "node-runtime-1",
      toNodeId: "node-runtime-1",
      edgeType: "semantic_similarity",
      confidence: "high",
      evidence: { score: 0.91 }
    }],
    citationCandidates: [{
      citationId: "citation-runtime-1",
      revisionId: "rev-runtime",
      chunkId: "chunk-runtime-1",
      experimentId: "exp-runtime",
      entityId: "rxn-runtime-1",
      blockId: "rxn-1",
      sourceRange,
      quality: { score: 0.8 }
    }],
    agentRuns: [{
      agentRunId: "agent-run-1",
      experimentId: "exp-runtime",
      revisionId: "rev-runtime",
      status: "completed",
      goal: "Apply reviewed patch",
      auditTimeline: [{ eventId: "event-1", type: "run_created" }]
    }],
    agentToolCalls: [{
      toolCallId: "tool-call-1",
      agentRunId: "agent-run-1",
      toolName: "query_rag",
      input: { query: "yield" },
      output: { matches: 1 },
      status: "ok"
    }],
    patchProposals: [{
      patchProposalId: "patch-1",
      agentRunId: "agent-run-1",
      experimentId: "exp-runtime",
      defaultBaseRevisionId: "rev-runtime",
      patch: { edits: [] }
    }]
  });

describe("PostgreSQL runtime Graph/RAG persistence", () => {
  it("writes runtime records in dependency order inside one transaction", async () => {
    const client = createClient();
    const records = buildRuntimeRecords();

    const result = await persistPostgresRuntimeGraphRagRecords(client, records);

    expect(result.records).toBe(records);
    expect(sqlCalls(client.calls)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO chemd_reaction_graph_snapshots"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_edges"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_edges"),
      expect.stringContaining("INSERT INTO chemd_rag_chunk_citations"),
      expect.stringContaining("INSERT INTO chemd_agent_runs"),
      expect.stringContaining("INSERT INTO chemd_agent_tool_calls"),
      expect.stringContaining("INSERT INTO chemd_patch_proposals"),
      "COMMIT"
    ]);
  });

  it("accepts runtime builder input and skips empty record collections", async () => {
    const client = createClient();

    const result = await persistPostgresRuntimeGraphRagRecords(client, {
      createdAt,
      graphSnapshot: {
        graphSnapshotId: "graph-empty",
        experimentId: "exp-runtime",
        sourceRevisionIds: ["rev-runtime"],
        graphKind: "agent_audit"
      }
    });

    expect(result.records.graphSnapshotInput.graphSnapshot).toMatchObject({
      graphSnapshotId: "graph-empty",
      nodeCount: 0,
      edgeCount: 0
    });
    expect(sqlCalls(client.calls)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO chemd_reaction_graph_snapshots"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_edges"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_nodes"),
      "COMMIT"
    ]);
    expect(sqlCalls(client.calls).join("\n")).not.toContain("chemd_agent_runs");
    expect(sqlCalls(client.calls).join("\n")).not.toContain("chemd_patch_proposals");
  });

  it("rolls back the full runtime transaction on failure", async () => {
    const client = createClient([], "INSERT INTO chemd_agent_tool_calls");

    await expect(
      persistPostgresRuntimeGraphRagRecords(client, buildRuntimeRecords())
    ).rejects.toThrow("failed on INSERT INTO chemd_agent_tool_calls");

    expect(sqlCalls(client.calls)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO chemd_reaction_graph_snapshots"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_edges"),
      expect.stringContaining("DELETE FROM chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_nodes"),
      expect.stringContaining("INSERT INTO chemd_reaction_graph_edges"),
      expect.stringContaining("INSERT INTO chemd_rag_chunk_citations"),
      expect.stringContaining("INSERT INTO chemd_agent_runs"),
      expect.stringContaining("INSERT INTO chemd_agent_tool_calls"),
      "ROLLBACK"
    ]);
    expect(sqlCalls(client.calls)).not.toContain("COMMIT");
    expect(sqlCalls(client.calls).join("\n")).not.toContain("chemd_patch_proposals");
  });

  it("does not introduce desktop tables or pg bindings", async () => {
    const client = createClient();
    await persistPostgresRuntimeGraphRagRecords(client, buildRuntimeRecords());
    const sql = sqlCalls(client.calls).join("\n");
    const helperSource = readFileSync(
      new URL("./graph-rag-runtime-persistence.ts", import.meta.url),
      "utf8"
    );
    const packageJson = JSON.parse(readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8"
    )) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {})
    ];

    expect(sql).not.toContain("desktop_");
    expect(sql).not.toContain("chemd_desktop_");
    expect(helperSource).not.toContain("@chemd/language-service");
    expect(helperSource).not.toContain("@chemd/agent-tools");
    expect(helperSource).not.toContain("from \"pg\"");
    expect(helperSource).not.toContain("from 'pg'");
    expect(helperSource).not.toContain("require(\"pg\")");
    expect(dependencyNames).not.toContain("pg");
  });
});
