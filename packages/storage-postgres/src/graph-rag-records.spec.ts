import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "@chemd/compiler";

import {
  buildPostgresGraphRagStorageRecords,
  getPostgresGraphRagExtensionSchemaSql
} from ".";

const source = `---
id: exp-desktop
title: Graph RAG Contract
date: 2026-05-12
---

:::chemd #rxn-main
kind: reaction
reactants: aldehyde
products: alcohol
solvent: THF
yield: 72%
route: route-a
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: 72%
:::
`;

const sourceRange = {
  start: 40,
  end: 160,
  startLine: 6,
  startColumn: 1,
  endLine: 12,
  endColumn: 4
};

const buildRecords = () => {
  const compiled = compileChemd(source, { strictChemdKind: true });
  return buildPostgresGraphRagStorageRecords({
    experimentId: "exp-desktop",
    revisionId: "rev-graph-rag-1",
    createdAt: "2026-05-12T00:00:00.000Z",
    trainingExport: compiled.trainingExport,
    ragExport: compiled.ragExport,
    graphSnapshotId: "graph-snapshot-1",
    graphIndex: {
      schema_version: "chemd-training-graph-index/v0.1",
      index_scope: {
        document_ids: ["exp-desktop"],
        sources: [{ document_id: "exp-desktop", file_path: "experiments/graph.chemd" }]
      },
      nodes: [],
      edges: [
        {
          edge_id: "edge-evidence-1",
          edge_type: "evidence_link",
          from_node_id: "rxn::exp-desktop::rxn-main",
          to_node_id: "res::exp-desktop::res-main",
          document_id: "exp-desktop",
          confidence: 0.7,
          properties: { evidence_entity_ids: ["res::exp-desktop::res-main"] }
        }
      ],
      reaction_features: [
        {
          reaction_entity_id: "rxn::exp-desktop::rxn-main",
          document_id: "exp-desktop",
          reaction_signature: "aldehyde->alcohol",
          participant_signature: "aldehyde|alcohol",
          fingerprint_status: "not_available",
          chemistry_feature_ref_ids: [],
          cluster_keys: [{ basis: "route", key: "route-a" }],
          changed_variable_fields: [],
          controlled_variable_fields: ["solvent"],
          reaction_family: "reduction",
          route_id: "route-a"
        }
      ],
      reaction_clusters: [],
      reaction_similarity_edges: [
        {
          edge_id: "sim-1",
          from_reaction_entity_id: "rxn::exp-desktop::rxn-main",
          to_reaction_entity_id: "rxn::exp-desktop::rxn-main",
          basis: ["same_route"],
          score: 0.92,
          warnings: []
        }
      ],
      warnings: []
    },
    sourceRangesByEntityId: {
      "rxn::exp-desktop::rxn-main": sourceRange,
      "res::exp-desktop::res-main": sourceRange
    },
    sourceRangesByChunkId: Object.fromEntries(
      compiled.ragExport.chunks.map((chunk) => [chunk.chunk_id, sourceRange])
    ),
    graphEdgeEvidenceByEdgeId: {
      "edge-evidence-1": {
        experiment_id: "exp-desktop",
        revision_id: "rev-graph-rag-1",
        evidence_entity_ids: ["res::exp-desktop::res-main"],
        source_range: sourceRange
      }
    },
    agentRuns: [
      {
        agentRunId: "agent-run-1",
        experimentId: "exp-desktop",
        revisionId: "rev-graph-rag-1",
        status: "succeeded",
        goal: "Propose a repair",
        auditTimeline: [{ event_id: "event-1", type: "run_created" }],
        startedAt: "2026-05-12T00:00:00.000Z"
      }
    ],
    patchProposals: [
      {
        patchProposalId: "patch-1",
        agentRunId: "agent-run-1",
        experimentId: "exp-desktop",
        baseRevisionId: "rev-graph-rag-1",
        patch: { edits: [] },
        status: "validated",
        createdAt: "2026-05-12T00:00:00.000Z"
      }
    ]
  });
};

describe("PostgreSQL Graph/RAG extension schema", () => {
  it("adds only shared Graph, Agent, and citation extension tables", () => {
    const sql = getPostgresGraphRagExtensionSchemaSql();

    expect(sql).not.toContain("chemd_desktop_");
    expect(sql).not.toContain("CREATE TABLE IF NOT EXISTS chemd_rag_chunks (");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_reaction_graph_snapshots");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_reaction_graph_nodes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_reaction_graph_edges");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_rag_chunk_citations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_agent_runs");
    expect(sql).toContain("audit_timeline jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_agent_tool_calls");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS chemd_patch_proposals");
    expect(sql).toContain("REFERENCES chemd_experiments(experiment_id)");
    expect(sql).toContain("REFERENCES chemd_experiment_revisions(revision_id)");
    expect(sql).toContain("REFERENCES chemd_rag_chunks(revision_id, chunk_id)");
  });
});

describe("PostgreSQL Graph/RAG extension records", () => {
  it("preserves citations, graph evidence, source ranges, and Agent audit links", () => {
    const records = buildRecords();

    expect(records.graphSnapshot).toMatchObject({
      graphSnapshotId: "graph-snapshot-1",
      experimentId: "exp-desktop",
      sourceRevisionIds: ["rev-graph-rag-1"]
    });
    expect(records.reactionGraphNodes[0]).toMatchObject({
      experimentId: "exp-desktop",
      revisionId: "rev-graph-rag-1",
      entityId: "rxn::exp-desktop::rxn-main",
      sourceRange,
      routeId: "route-a"
    });
    expect(records.reactionGraphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeId: "edge-evidence-1",
        experimentId: "exp-desktop",
        evidence: expect.objectContaining({
          evidence_entity_ids: ["res::exp-desktop::res-main"],
          source_range: sourceRange
        })
      })
    ]));
    expect(records.ragChunkCitations[0]).toMatchObject({
      revisionId: "rev-graph-rag-1",
      experimentId: "exp-desktop",
      citation: expect.objectContaining({
        experimentId: "exp-desktop",
        revisionId: "rev-graph-rag-1",
        sourceRange
      }),
      sourceRange
    });
    expect(records.agentRuns[0]).toMatchObject({
      experimentId: "exp-desktop",
      revisionId: "rev-graph-rag-1",
      auditTimeline: [{ event_id: "event-1", type: "run_created" }]
    });
    expect(records.patchProposals[0]).toMatchObject({
      experimentId: "exp-desktop",
      baseRevisionId: "rev-graph-rag-1"
    });
  });

  it("rejects RAG citations without source ranges before records are emitted", () => {
    const compiled = compileChemd(source, { strictChemdKind: true });
    const firstChunk = compiled.ragExport.chunks[0];
    if (!firstChunk) {
      throw new Error("Expected compiled fixture to produce a RAG chunk");
    }

    expect(() =>
      buildPostgresGraphRagStorageRecords({
        experimentId: "exp-desktop",
        revisionId: "rev-graph-rag-1",
        trainingExport: compiled.trainingExport,
        ragExport: {
          ...compiled.ragExport,
          chunks: [
            {
              ...firstChunk,
              chunk_id: "chunk-without-source-range",
              source_entity_ids: []
            }
          ]
        }
      })
    ).toThrow("Missing source range");
  });

  it("keeps the production contract free of runtime database IO and compiler calls", () => {
    const sources = [
      readFileSync(new URL("./graph-rag-records.ts", import.meta.url), "utf8"),
      readFileSync(new URL("./graph-rag-schema.ts", import.meta.url), "utf8")
    ].join("\n");

    expect(sources).not.toContain("compileChemd");
    expect(sources).not.toContain("process.env");
    expect(sources).not.toContain("from \"pg\"");
    expect(sources).not.toContain(".query(");
    expect(sources).not.toContain("createPool");
  });
});
