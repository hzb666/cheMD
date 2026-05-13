import { describe, expect, it } from "vitest";

import { compileChemdForEditor } from "@chemd/language-service";

import {
  buildDesktopReactionClusterPanel,
  type DesktopReactionCluster,
  type DesktopReactionClusterGraphIndex,
  type DesktopReactionGraphFeature,
  type DesktopReactionSimilarityEdge
} from "./desktop-reaction-cluster-panel";

const feature = (
  reactionEntityId: string,
  documentId: string,
  participantSignature: string
): DesktopReactionGraphFeature => ({
  reaction_entity_id: reactionEntityId,
  document_id: documentId,
  participant_signature: participantSignature,
  reaction_family: "esterification"
});

const cluster = (
  members: string[],
  sharedFeatures: string[] = ["esterification"]
): DesktopReactionCluster => ({
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
  toReactionEntityId: string
): DesktopReactionSimilarityEdge => ({
  edge_id: "edge-family",
  from_reaction_entity_id: fromReactionEntityId,
  to_reaction_entity_id: toReactionEntityId,
  basis: ["same_reaction_family"],
  score: 0.55,
  warnings: ["semantic_similarity_without_computed_fingerprint"]
});

const graphIndex = (
  features: DesktopReactionGraphFeature[],
  clusters: DesktopReactionCluster[],
  edges: DesktopReactionSimilarityEdge[] = []
): DesktopReactionClusterGraphIndex => ({
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

describe("buildDesktopReactionClusterPanel", () => {
  it("builds ready cluster list and selected detail", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildDesktopReactionClusterPanel({
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
    const panel = buildDesktopReactionClusterPanel(graphIndex([], []));

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
    const panel = buildDesktopReactionClusterPanel(failedOutput);

    expect(panel.state).toBe("fallback");
    expect(panel.reason).toBe("compile_failed");
    expect(panel.message).toContain("compiler exploded");
    expect(panel.compiledAt).toBe("2026-05-13T10:00:00.000Z");
    expect(panel.summary.reason).toBe("compile_failed");
  });

  it("surfaces semantic-only and weak warnings", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid+alcohol=>ester");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const panel = buildDesktopReactionClusterPanel(graphIndex(
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
});
