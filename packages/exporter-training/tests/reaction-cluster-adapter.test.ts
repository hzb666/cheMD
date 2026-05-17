import { describe, expect, it } from "vitest";

import {
  buildReactionClusterViewModel,
  findReactionClusterDetail,
  type ChemdTrainingGraphIndexV1,
  type TrainingReactionClusterV1,
  type TrainingReactionGraphFeatureV1,
  type TrainingReactionSimilarityEdgeV1
} from "../src/index";

const feature = (
  reactionEntityId: string,
  documentId: string,
  participantSignature: string
): TrainingReactionGraphFeatureV1 => ({
  reaction_entity_id: reactionEntityId,
  document_id: documentId,
  reaction_signature: `esterification::${participantSignature}`,
  participant_signature: participantSignature,
  fingerprint_status: "not_available",
  chemistry_feature_ref_ids: [],
  cluster_keys: [],
  changed_variable_fields: [],
  controlled_variable_fields: [],
  reaction_family: "esterification"
});

const cluster = (
  clusterId: string,
  key: string,
  members: string[],
  documentIds: string[],
  sharedFeatures: string[] = [key]
): TrainingReactionClusterV1 => ({
  cluster_id: clusterId,
  basis: "reaction_family",
  key,
  member_reaction_entity_ids: members,
  document_ids: documentIds,
  confidence: "low",
  shared_features: sharedFeatures,
  warnings: ["family_only_cluster_review_required"],
  reaction_family: "esterification"
});

const edge = (
  edgeId: string,
  fromReactionEntityId: string,
  toReactionEntityId: string,
  score = 0.55
): TrainingReactionSimilarityEdgeV1 => ({
  edge_id: edgeId,
  from_reaction_entity_id: fromReactionEntityId,
  to_reaction_entity_id: toReactionEntityId,
  basis: ["same_reaction_family"],
  score,
  warnings: ["semantic_similarity_without_computed_fingerprint"]
});

const graphIndex = (
  reactionFeatures: TrainingReactionGraphFeatureV1[],
  reactionClusters: TrainingReactionClusterV1[],
  reactionSimilarityEdges: TrainingReactionSimilarityEdgeV1[] = []
): ChemdTrainingGraphIndexV1 => ({
  schema_version: "chemd-training-graph-index/v0.1",
  index_scope: {
    document_ids: ["doc-a", "doc-b"],
    sources: [
      { document_id: "doc-a", file_path: "a.chemd", content_hash: "hash-a" },
      { document_id: "doc-b", file_path: "b.chemd", content_hash: "hash-b" }
    ]
  },
  nodes: [],
  edges: [],
  reaction_features: reactionFeatures,
  reaction_clusters: reactionClusters,
  reaction_similarity_edges: reactionSimilarityEdges,
  warnings: ["computed_reaction_fingerprints_not_available"]
});

describe("reaction cluster adapter", () => {
  it("returns an explainable empty view model when no clusters are available", () => {
    const viewModel = buildReactionClusterViewModel(graphIndex([], []));

    expect(viewModel.clusters).toEqual([]);
    expect(viewModel.details).toEqual([]);
    expect(viewModel.summary).toMatchObject({
      cluster_count: 0,
      reaction_count: 0,
      similarity_edge_count: 0,
      empty_reason: "no_reaction_clusters"
    });
  });

  it("builds list and detail data for a single cluster", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "acid-a+alcohol=>ester-a");
    const second = feature("rxn::doc-a::rxn-b", "doc-a", "acid-b+alcohol=>ester-b");
    const viewModel = buildReactionClusterViewModel(graphIndex(
      [first, second],
      [cluster("cluster-family", "esterification", [
        first.reaction_entity_id,
        second.reaction_entity_id
      ], ["doc-a"])],
      [edge("edge-1", first.reaction_entity_id, second.reaction_entity_id)]
    ));

    expect(viewModel.clusters[0]).toMatchObject({
      cluster_id: "cluster-family",
      label: "Reaction family: esterification",
      reaction_count: 2,
      edge_count: 1,
      representative_reaction_id: first.reaction_entity_id,
      citation_ids: ["doc-a"],
      source_ids: ["hash-a"]
    });
    expect(viewModel.details[0].members).toHaveLength(2);
    expect(viewModel.details[0].similarity_edges[0]).toMatchObject({
      edge_id: "edge-1",
      basis: ["same_reaction_family"],
      score: 0.55
    });
  });

  it("sorts multiple clusters deterministically", () => {
    const features = [
      feature("rxn::doc-a::rxn-a", "doc-a", "a=>b"),
      feature("rxn::doc-a::rxn-b", "doc-a", "b=>c"),
      feature("rxn::doc-b::rxn-c", "doc-b", "c=>d")
    ];
    const large = cluster("cluster-large", "esterification-large", [
      features[0].reaction_entity_id,
      features[1].reaction_entity_id,
      features[2].reaction_entity_id
    ], ["doc-a", "doc-b"]);
    const small = cluster("cluster-small", "esterification-small", [
      features[0].reaction_entity_id,
      features[1].reaction_entity_id
    ], ["doc-a"]);
    const viewModel = buildReactionClusterViewModel(graphIndex(features, [small, large], [
      edge("edge-1", features[0].reaction_entity_id, features[1].reaction_entity_id),
      edge("edge-2", features[1].reaction_entity_id, features[2].reaction_entity_id)
    ]));

    expect(viewModel.clusters.map((item) => item.cluster_id)).toEqual([
      "cluster-large",
      "cluster-small"
    ]);
    expect(viewModel.summary).toMatchObject({
      cluster_count: 2,
      reaction_count: 3,
      similarity_edge_count: 2,
      citation_ids: ["doc-a", "doc-b"],
      source_ids: ["hash-a", "hash-b"]
    });
  });

  it("looks up cluster details by id", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "a=>b");
    const second = feature("rxn::doc-b::rxn-b", "doc-b", "b=>c");
    const viewModel = buildReactionClusterViewModel(graphIndex(
      [first, second],
      [cluster("cluster-lookup", "esterification", [
        first.reaction_entity_id,
        second.reaction_entity_id
      ], ["doc-a", "doc-b"])]
    ));

    expect(findReactionClusterDetail(viewModel, "cluster-lookup")?.members.map((item) =>
      item.reaction_entity_id
    )).toEqual([
      first.reaction_entity_id,
      second.reaction_entity_id
    ]);
    expect(findReactionClusterDetail(viewModel, "missing")).toBeUndefined();
  });

  it("degrades missing evidence into an explicit adapter warning", () => {
    const first = feature("rxn::doc-a::rxn-a", "doc-a", "a=>b");
    const weakCluster = {
      ...cluster("cluster-weak", "weak", [first.reaction_entity_id], ["doc-a"], []),
      warnings: []
    };
    const viewModel = buildReactionClusterViewModel(graphIndex([first], [weakCluster]));

    expect(viewModel.clusters[0].warnings).toContain("cluster_evidence_not_available");
    expect(viewModel.details[0].evidence_summary).toMatchObject({
      shared_features: [],
      similarity_bases: [],
      warnings: ["cluster_evidence_not_available"]
    });
  });
});
