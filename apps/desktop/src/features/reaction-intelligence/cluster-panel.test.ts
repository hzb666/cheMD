import { describe, expect, it } from "vitest";

import { compileChemdForEditor } from "@chemd/language-service";

import {
  buildReactionClusterPanel,
  type ReactionCluster,
  type ReactionClusterGraphIndex,
  type ReactionGraphFeature,
  type ReactionSimilarityEdge
} from "./cluster-panel";

const feature = (
  reactionEntityId: string,
  documentId: string,
  participantSignature: string
): ReactionGraphFeature => ({
  reaction_entity_id: reactionEntityId,
  document_id: documentId,
  participant_signature: participantSignature,
  reaction_family: "esterification"
});

const cluster = (
  members: string[],
  sharedFeatures: string[] = ["esterification"]
): ReactionCluster => ({
  cluster_id: "cluster-family",
  basis: "reaction_family",
  key: "esterification",
  member_reaction_entity_ids: members,
  document_ids: ["doc-a"],
  confidence: "low",
  shared_features: sharedFeatures,
  warnings: ["family_only_cluster_review_required"]
});

const edge = (
  fromReactionEntityId: string,
  toReactionEntityId: string,
  overrides: Partial<ReactionSimilarityEdge> = {}
): ReactionSimilarityEdge => ({
  edge_id: overrides.edge_id ?? "edge-family",
  from_reaction_entity_id: fromReactionEntityId,
  to_reaction_entity_id: toReactionEntityId,
  basis: overrides.basis ?? ["same_reaction_family"],
  score: overrides.score ?? 0.55,
  confidence: overrides.confidence,
  provider_ids: overrides.provider_ids,
  warnings: overrides.warnings ?? ["semantic_similarity_without_computed_fingerprint"]
});

const graphIndex = (
  features: ReactionGraphFeature[],
  clusters: ReactionCluster[],
  edges: ReactionSimilarityEdge[] = []
): ReactionClusterGraphIndex => ({
  schema_version: "chemd-training-graph-index/v0.1",
  index_scope: {
    sources: [
      { document_id: "doc-a", file_path: "a.chemd.md", content_hash: "hash-a" }
    ]
  },
  reaction_features: features,
  reaction_clusters: clusters,
  reaction_similarity_edges: edges,
  warnings: ["computed_reaction_fingerprints_not_available"]
});

describe("buildReactionClusterPanel", () => {
  it("builds ready cluster list and selected detail", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildReactionClusterPanel({
      graphIndex: graphIndex(
        [first, second],
        [cluster([first.reaction_entity_id, second.reaction_entity_id])],
        [edge(first.reaction_entity_id, second.reaction_entity_id)]
      ),
      selectedClusterId: "cluster-family",
      compiledAt: "2026-05-13T00:00:00.000Z",
      documentUri: "file:///D:/labs/a.chemd.md"
    });

    expect(panel.state).toBe("ready");
    expect(panel.summary).toMatchObject({
      clusterCount: 1,
      reactionCount: 2,
      similarityEdgeCount: 1,
      selectedClusterId: "cluster-family"
    });
    expect(panel.clusters[0]).toMatchObject({
      clusterId: "cluster-family",
      memberCount: 2,
      sharedFeatures: ["esterification"],
      similarityEdgeBasis: ["same_reaction_family"],
      maxSimilarityScore: 0.55
    });
    expect(panel.selectedDetail?.members.map((member) => member.sourceIds)).toEqual([
      ["hash-a"],
      ["hash-a"]
    ]);
    expect(panel.selectedDetail?.edges[0]).toMatchObject({
      basis: ["same_reaction_family"],
      score: 0.55
    });
  });

  it("returns explainable fallback when graph index has no clusters", () => {
    const panel = buildReactionClusterPanel(graphIndex([], []));

    expect(panel.state).toBe("fallback");
    expect(panel.reason).toBe("no_reaction_clusters");
    expect(panel.message).toContain("no clusters");
    expect(panel.clusters).toEqual([]);
    expect(panel.summary).toMatchObject({
      clusterCount: 0,
      reactionCount: 0,
      similarityEdgeCount: 0,
      reason: "no_reaction_clusters"
    });
    expect(panel.warnings).toContain("computed_reaction_fingerprints_not_available");
  });

  it("returns compile failed fallback without requiring a graph index", () => {
    const failedOutput = compileChemdForEditor(
      { source: "not used" },
      {
        compileChemd: () => {
          throw new Error("compiler exploded");
        },
        now: () => new Date("2026-05-13T10:00:00.000Z")
      }
    );
    const panel = buildReactionClusterPanel(failedOutput);

    expect(panel.state).toBe("fallback");
    expect(panel.reason).toBe("compile_failed");
    expect(panel.message).toContain("compiler exploded");
    expect(panel.compiledAt).toBe("2026-05-13T10:00:00.000Z");
    expect(panel.summary.reason).toBe("compile_failed");
  });

  it("surfaces semantic-only and weak warnings", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildReactionClusterPanel(graphIndex(
      [first, second],
      [cluster([first.reaction_entity_id, second.reaction_entity_id], [])],
      [edge(first.reaction_entity_id, second.reaction_entity_id)]
    ));

    expect(panel.selectedDetail?.semanticOnly).toBe(true);
    expect(panel.selectedDetail?.weak).toBe(true);
    expect(panel.selectedDetail?.warnings).toEqual([
      "family_only_cluster_review_required",
      "semantic_similarity_without_computed_fingerprint"
    ]);
    expect(panel.warnings).toContain("computed_reaction_fingerprints_not_available");
    expect(panel.warnings).toContain("semantic_similarity_without_computed_fingerprint");
  });

  it("keeps hybrid computed edge evidence out of semantic-only fallback", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildReactionClusterPanel(graphIndex(
      [first, second],
      [cluster([first.reaction_entity_id, second.reaction_entity_id])],
      [
        edge(first.reaction_entity_id, second.reaction_entity_id, {
          basis: ["rdkit_fingerprint_tanimoto", "semantic_family_support", "hybrid_consensus"],
          confidence: "high",
          provider_ids: ["rdkit-local", "hybrid-consensus"],
          score: 0.88,
          warnings: ["semantic_similarity_without_computed_fingerprint"]
        })
      ]
    ));

    expect(panel.selectedDetail?.semanticOnly).toBe(false);
    expect(panel.selectedDetail?.computedSimilarityBasis).toEqual([
      "hybrid_consensus",
      "rdkit_fingerprint_tanimoto"
    ]);
    expect(panel.selectedDetail?.semanticSimilarityBasis).toEqual(["semantic_family_support"]);
    expect(panel.selectedDetail?.providerIds).toEqual(["hybrid-consensus", "rdkit-local"]);
    expect(panel.selectedDetail?.edgeConfidences).toEqual(["high"]);
    expect(panel.selectedDetail?.edges[0]).toMatchObject({
      computedBasis: ["hybrid_consensus", "rdkit_fingerprint_tanimoto"],
      semanticBasis: ["semantic_family_support"],
      confidence: "high",
      providerIds: ["hybrid-consensus", "rdkit-local"]
    });
  });

  it("keeps pure semantic warning fallback marked for review", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildReactionClusterPanel(graphIndex(
      [first, second],
      [cluster([first.reaction_entity_id, second.reaction_entity_id])],
      [
        edge(first.reaction_entity_id, second.reaction_entity_id, {
          basis: ["semantic_family_support", "semantic_procedure_support"],
          confidence: "medium",
          provider_ids: ["semantic-fallback"],
          warnings: ["semantic_similarity_without_computed_fingerprint"]
        })
      ]
    ));

    expect(panel.selectedDetail?.semanticOnly).toBe(true);
    expect(panel.selectedDetail?.weak).toBe(true);
    expect(panel.selectedDetail?.computedSimilarityBasis).toEqual([]);
    expect(panel.selectedDetail?.semanticSimilarityBasis).toEqual([
      "semantic_family_support",
      "semantic_procedure_support"
    ]);
    expect(panel.selectedDetail?.providerIds).toEqual(["semantic-fallback"]);
    expect(panel.selectedDetail?.edges[0].confidence).toBe("medium");
  });
});
