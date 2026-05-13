import { describe, expect, it } from "vitest";

import {
  buildPostgresRuntimeGraphRagRecords,
  buildReactionIntelligenceRuntimeGraphRagInput,
  type BuildPostgresRuntimeGraphRagInput,
  type ChemdReactionIntelligenceArtifactV1
} from ".";

const createdAt = "2026-05-13T01:00:00.000Z";

const sourceRange = {
  start: 1,
  end: 12,
  startLine: 1,
  startColumn: 1,
  endLine: 2,
  endColumn: 4
};

const baseInput = (): BuildPostgresRuntimeGraphRagInput => ({
  createdAt,
  graphSnapshot: {
    graphSnapshotId: "graph-runtime-reaction",
    experimentId: "exp-reaction",
    sourceRevisionIds: ["rev-reaction"],
    graphKind: "reaction"
  },
  nodes: [
    {
      nodeId: "node-rxn-a",
      graphSnapshotId: "graph-runtime-reaction",
      experimentId: "exp-reaction",
      revisionId: "rev-reaction",
      entityId: "rxn-a",
      sourceRange,
      payload: { semantic_id: "rxn-a" }
    },
    {
      nodeId: "node-rxn-b",
      graphSnapshotId: "graph-runtime-reaction",
      experimentId: "exp-reaction",
      revisionId: "rev-reaction",
      entityId: "rxn-b",
      sourceRange,
      payload: { semantic_id: "rxn-b" }
    }
  ]
});

const artifactFixture = (
  overrides: Partial<ChemdReactionIntelligenceArtifactV1> = {}
): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: "artifact-reaction-1",
  job_id: "job-reaction-1",
  graph_index_id: "graph-index-reaction",
  generated_at: "2026-05-13T00:30:00.000Z",
  providers: [
    {
      provider_id: "provider-rdkit",
      kind: "rdkit_fingerprint",
      status: "PASS",
      package_name: "rdkit",
      package_version: "2025.09",
      warnings: []
    },
    {
      provider_id: "provider-rxnfp",
      kind: "rxnfp",
      status: "SKIP",
      model_id: "rxnfp-local",
      warnings: ["model_not_configured"]
    }
  ],
  reaction_features: [
    {
      reaction_entity_id: "rxn-a",
      source_hash: "sha256:rxn-a",
      fingerprint_refs: [
        {
          feature_ref_id: "feature-rxn-a-rdkit",
          provider: "rdkit",
          kind: "bit_vector",
          dimension: 2048,
          storage: "sidecar_file",
          hash: "sha256:fp-a"
        }
      ],
      reaction_center: {
        provider: "rxnmapper_derived",
        center_signature: "C-O",
        confidence: "medium",
        warnings: ["reaction_center_inferred"]
      },
      warnings: []
    }
  ],
  similarity_edges: [
    {
      edge_id: "computed-edge-a-b",
      from_reaction_entity_id: "rxn-a",
      to_reaction_entity_id: "rxn-b",
      score: 0.91,
      confidence: "high",
      basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
      provider_ids: ["provider-rdkit", "provider-rxnfp"],
      source_hashes: ["sha256:rxn-a", "sha256:rxn-b"],
      warnings: ["rxnfp_skipped"]
    }
  ],
  warnings: ["artifact_has_skipped_provider"],
  ...overrides
});

describe("reaction intelligence runtime Graph/RAG adapter", () => {
  it("builds stable semantic similarity edge ids from artifact edges", () => {
    const first = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture(),
      baseInput: baseInput()
    });
    const second = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture(),
      baseInput: baseInput()
    });

    expect(first.validation.valid).toBe(true);
    expect(first.input.edges?.[0]?.edgeId).toBe(second.input.edges?.[0]?.edgeId);
    expect(first.input.edges?.[0]?.edgeId).toBe(
      "reaction-intelligence::artifact-reaction-1::computed-edge-a-b"
    );
  });

  it("preserves basis, provider, source hash, warning, and artifact evidence", () => {
    const result = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture(),
      baseInput: baseInput()
    });
    const evidence = result.input.edges?.[0]?.evidence;

    expect(evidence).toMatchObject({
      source: "chemd_reaction_intelligence_artifact",
      artifact_id: "artifact-reaction-1",
      job_id: "job-reaction-1",
      graph_index_id: "graph-index-reaction",
      similarity_edge_id: "computed-edge-a-b",
      score: 0.91,
      basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
      provider_ids: ["provider-rdkit", "provider-rxnfp"],
      source_hashes: ["sha256:rxn-a", "sha256:rxn-b"],
      warnings: ["artifact_has_skipped_provider", "rxnfp_skipped"]
    });
    expect(evidence?.providers).toEqual([
      expect.objectContaining({ provider_id: "provider-rdkit", status: "PASS" }),
      expect.objectContaining({ provider_id: "provider-rxnfp", status: "SKIP" })
    ]);
    expect(evidence?.reaction_features).toEqual([
      expect.objectContaining({
        reaction_entity_id: "rxn-a",
        source_hash: "sha256:rxn-a",
        fingerprint_refs: [
          expect.objectContaining({ feature_ref_id: "feature-rxn-a-rdkit" })
        ]
      })
    ]);
  });

  it("returns validation output and no appended edges for missing or empty artifacts", () => {
    const missing = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: null,
      baseInput: baseInput()
    });
    const empty = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture({ similarity_edges: [] }),
      baseInput: baseInput()
    });

    expect(missing.validation).toMatchObject({
      valid: false,
      errors: ["artifact is required"]
    });
    expect(missing.appendedEdgeCount).toBe(0);
    expect(missing.input.edges).toEqual([]);
    expect(empty.validation).toMatchObject({
      valid: true,
      warnings: ["similarity_edges is empty"]
    });
    expect(empty.appendedEdgeCount).toBe(0);
    expect(empty.input.edges).toEqual([]);
  });

  it("appends artifact edges without replacing existing snapshot edges or nodes", () => {
    const base = baseInput();
    const existingEdge = {
      edgeId: "existing-edge",
      graphSnapshotId: "graph-runtime-reaction",
      experimentId: "exp-reaction",
      fromNodeId: "node-rxn-a",
      toNodeId: "node-rxn-b",
      edgeType: "evidence_link" as const,
      confidence: "unknown" as const,
      evidence: { source: "existing" },
      createdAt
    };
    const result = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture(),
      baseInput: {
        ...base,
        edges: [existingEdge],
        graphSnapshot: { ...base.graphSnapshot, edgeCount: 1 }
      }
    });

    expect(result.input.nodes).toBe(base.nodes);
    expect(result.input.edges).toHaveLength(2);
    expect(result.input.edges?.[0]).toBe(existingEdge);
    expect(result.input.edges?.[1]).toMatchObject({
      fromNodeId: "node-rxn-a",
      toNodeId: "node-rxn-b",
      edgeType: "semantic_similarity"
    });
    expect(result.input.graphSnapshot.edgeCount).toBe(2);
  });

  it("emits runtime input consumable by buildPostgresRuntimeGraphRagRecords", () => {
    const result = buildReactionIntelligenceRuntimeGraphRagInput({
      artifact: artifactFixture(),
      baseInput: baseInput()
    });
    const records = buildPostgresRuntimeGraphRagRecords(result.input);

    expect(records.graphSnapshotInput.edges?.[0]).toMatchObject({
      edgeId: "reaction-intelligence::artifact-reaction-1::computed-edge-a-b",
      edgeType: "semantic_similarity",
      confidence: "high",
      evidence: expect.objectContaining({
        runtime_edge_type: "semantic_similarity",
        basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"]
      })
    });
  });
});
