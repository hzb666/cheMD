import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildReactionIntelligenceCanonicalInput,
  buildReactionIntelligenceServiceJob,
  buildTrainingGraphIndexFromUnderstandings,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument,
  mergeReactionIntelligenceArtifactIntoGraphIndex,
  type ReactionIntelligenceArtifact
} from "../src/index";

const buildUnderstanding = (source: string) => {
  const document = resolveChemd(parseChemd(source));
  const checked = typecheckDocument(document);
  const record = exportTrainingRecordFromDocument(document, {
    typedGraph: checked.typedGraph,
    stepGraph: checked.stepGraph,
    exportedAt: "2026-05-13T00:00:00.000Z"
  });

  return buildTrainingUnderstandingFromRecord(record);
};

const sourceA = `---
id: exp-ri-a
title: Reaction Intelligence A
date: 2026-05-13
---

:::chemd #rxn-a
kind: reaction
name: esterification of acid A
reactants: acid-a | alcohol
products: ester-a
reagents: catalytic H2SO4
:::

:::procedure #proc-a
step: add | materials=acid-a
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

const sourceB = `---
id: exp-ri-b
title: Reaction Intelligence B
date: 2026-05-13
---

:::chemd #rxn-b
kind: reaction
name: esterification of acid B
reactants: acid-b | alcohol
products: ester-b
reagents: catalytic H2SO4
:::

:::procedure #proc-b
step: add | materials=acid-b
step: add | materials=alcohol
step: hold | duration=12 h
step: concentrate
:::
`;

const rxnA = "rxn::exp-ri-a::rxn-a";
const rxnB = "rxn::exp-ri-b::rxn-b";

const buildIndex = () =>
  buildTrainingGraphIndexFromUnderstandings([
    buildUnderstanding(sourceA),
    buildUnderstanding(sourceB)
  ]);

const computedArtifact = (): ReactionIntelligenceArtifact => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: "ri-artifact-good",
  job_id: "ri-job-good",
  graph_index_schema_version: "chemd-training-graph-index/v0.1",
  provider_statuses: [
    {
      provider: "rdkit_fingerprint",
      status: "OK",
      warnings: []
    },
    {
      provider: "rxnfp",
      status: "OK",
      warnings: []
    }
  ],
  computed_features: [
    {
      feature_id: "ri-feature-a-rdkit",
      reaction_entity_id: rxnA,
      provider: "rdkit_fingerprint",
      feature_kind: "rdkit_reaction_fingerprint",
      status: "AVAILABLE",
      source: "computed_artifact",
      fingerprint_ref: "sha256:rdkit-a",
      confidence: 0.99,
      warnings: []
    },
    {
      feature_id: "ri-feature-b-rxnfp",
      reaction_entity_id: rxnB,
      provider: "rxnfp",
      feature_kind: "rxnfp_embedding",
      status: "AVAILABLE",
      source: "computed_artifact",
      vector_ref: "sha256:rxnfp-b",
      embedding_dimension: 256,
      confidence: 0.97,
      warnings: []
    }
  ],
  computed_similarity_edges: [
    {
      edge_id: "ri-edge-a-b",
      from_reaction_entity_id: rxnA,
      to_reaction_entity_id: rxnB,
      basis: ["hybrid_computed", "rdkit_tanimoto"],
      score: 0.82,
      source: "computed_artifact",
      contributions: [
        {
          basis: "rdkit_tanimoto",
          provider: "rdkit_fingerprint",
          score: 0.8,
          weight: 0.7,
          warnings: []
        },
        {
          basis: "rxnfp_cosine",
          provider: "rxnfp",
          score: 0.86,
          weight: 0.3,
          warnings: []
        }
      ],
      warnings: []
    }
  ],
  warnings: []
});

describe("reaction intelligence canonical input", () => {
  it("builds compute-ready reaction inputs from explicit chemistry feature refs", () => {
    const index = buildIndex();
    const featureRefId = "feature-ref::rxn-a::canonical-smiles";
    index.reaction_features[0] = {
      ...index.reaction_features[0],
      fingerprint_status: "external_ref_available",
      chemistry_feature_ref_ids: [featureRefId]
    };

    const input = buildReactionIntelligenceCanonicalInput(index, {
      graph_index_id: "graph-index::test",
      source_compile_run_ids: ["compile-run::test"],
      canonical_rxn_smiles_by_feature_ref: {
        [featureRefId]: "CC(=O)O.CCO>>CC(=O)OCC"
      }
    });

    expect(input).toMatchObject({
      schema_version: "chemd-reaction-intelligence-canonical-input/v0.1",
      graph_index_id: "graph-index::test",
      source_compile_run_ids: ["compile-run::test"],
      compute_ready_reaction_count: 1
    });
    expect(input.reactions[0]).toMatchObject({
      reaction_entity_id: rxnA,
      document_id: "exp-ri-a",
      canonical_rxn_smiles: "CC(=O)O.CCO>>CC(=O)OCC",
      chemistry_feature_ref_ids: [featureRefId],
      semantic_context: expect.objectContaining({
        reaction_family: "esterification",
        procedure_signature: "add>add>hold>concentrate"
      }),
      warnings: []
    });
  });

  it("keeps reactions without canonical chemistry as warned non-computed inputs", () => {
    const input = buildReactionIntelligenceCanonicalInput(buildIndex(), {
      graph_index_id: "graph-index::missing-smiles"
    });

    expect(input.compute_ready_reaction_count).toBe(0);
    expect(input.warnings).toEqual([
      "canonical_rxn_smiles_missing_for_reactions:2"
    ]);
    expect(input.reactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reaction_entity_id: rxnA,
        warnings: ["canonical_rxn_smiles_not_available"]
      })
    ]));
    expect(input.reactions[0]).not.toHaveProperty("canonical_rxn_smiles");
  });
});

describe("reaction intelligence service job", () => {
  it("converts only compute-ready canonical inputs into provider jobs", () => {
    const index = buildIndex();
    const featureRefId = "feature-ref::rxn-a::canonical-smiles";
    index.reaction_features[0] = {
      ...index.reaction_features[0],
      fingerprint_status: "external_ref_available",
      chemistry_feature_ref_ids: [featureRefId]
    };
    const canonicalInput = buildReactionIntelligenceCanonicalInput(index, {
      graph_index_id: "graph-index::service-job",
      source_compile_run_ids: ["compile-run::service-job"],
      canonical_rxn_smiles_by_feature_ref: {
        [featureRefId]: "CC(=O)O.CCO>>CC(=O)OCC"
      }
    });

    const result = buildReactionIntelligenceServiceJob(canonicalInput, {
      job_id: "job::service-job",
      requested_providers: ["rdkit_fingerprint", "hybrid_graph"]
    });

    expect(result.job).toMatchObject({
      schema_version: "chemd-reaction-intelligence-job/v0.1",
      job_id: "job::service-job",
      graph_index_id: "graph-index::service-job",
      source_compile_run_ids: ["compile-run::service-job"],
      requested_providers: ["rdkit_fingerprint", "hybrid_graph"],
      provider_policy: {
        missing_dependency: "skip",
        per_reaction_failure: "warn",
        allow_network: false
      }
    });
    expect(result.job.reactions).toEqual([
      expect.objectContaining({
        reaction_entity_id: rxnA,
        document_id: "exp-ri-a",
        canonical_rxn_smiles: "CC(=O)O.CCO>>CC(=O)OCC",
        participant_signature: "acid-a+alcohol=>ester-a",
        reaction_family: "esterification",
        procedure_signature: "add>add>hold>concentrate"
      })
    ]);
    expect(result.skipped_reaction_entity_ids).toEqual([rxnB]);
    expect(result.warnings).toEqual([
      "service_job_reaction_skipped_missing_canonical_rxn_smiles:rxn::exp-ri-b::rxn-b"
    ]);
  });
});

describe("reaction intelligence graph index merge", () => {
  it("merges computed artifact data without rewriting semantic source truth", () => {
    const index = buildIndex();
    const semanticEdge = index.reaction_similarity_edges.find((edge) =>
      edge.from_reaction_entity_id === rxnA && edge.to_reaction_entity_id === rxnB
    );
    const enriched = mergeReactionIntelligenceArtifactIntoGraphIndex(index, computedArtifact());

    expect(semanticEdge?.warnings).toEqual(["semantic_similarity_without_computed_fingerprint"]);
    expect(enriched.reaction_similarity_edges).toEqual(index.reaction_similarity_edges);
    expect(enriched.warnings).toEqual(index.warnings);
    expect(enriched.reaction_intelligence).toMatchObject({
      source_artifact_id: "ri-artifact-good",
      job_id: "ri-job-good",
      computed_features: expect.arrayContaining([
        expect.objectContaining({
          feature_id: "ri-feature-a-rdkit",
          source: "computed_artifact"
        })
      ]),
      computed_similarity_edges: [
        expect.objectContaining({
          edge_id: "ri-edge-a-b",
          basis: ["hybrid_computed", "rdkit_tanimoto"],
          score: 0.82
        })
      ],
      warnings: []
    });
  });

  it("merges strict clusters, candidate neighbors, and semantic groups explicitly", () => {
    const index = buildIndex();
    const artifact: ReactionIntelligenceArtifact = {
      ...computedArtifact(),
      strict_reaction_clusters: [
        {
          cluster_id: "strict-reaction-cluster::a::b",
          reaction_entity_ids: [rxnA, rxnB],
          representative_reaction_entity_id: rxnA,
          mean_score: 0.84,
          min_edge_score: 0.82,
          basis_summary: ["hybrid_consensus", "rdkit_fingerprint_tanimoto"],
          warnings: []
        }
      ],
      candidate_reaction_neighbors: [
        {
          edge_id: "candidate-edge::a::b",
          from_reaction_entity_id: rxnA,
          to_reaction_entity_id: rxnB,
          score: 0.62,
          basis: ["rdkit_fingerprint_tanimoto"],
          warnings: []
        }
      ],
      semantic_reaction_groups: [
        {
          group_id: "semantic-reaction-group::a::b",
          reaction_entity_ids: [rxnA, rxnB],
          mean_score: 0.9,
          basis_summary: ["semantic_family_support", "semantic_procedure_support"],
          warnings: ["semantic_similarity_without_computed_fingerprint"]
        }
      ]
    };

    const enriched = mergeReactionIntelligenceArtifactIntoGraphIndex(index, artifact);

    expect(enriched.reaction_intelligence.strict_reaction_clusters).toEqual([
      expect.objectContaining({
        cluster_id: "strict-reaction-cluster::a::b",
        reaction_entity_ids: [rxnA, rxnB],
        min_edge_score: 0.82
      })
    ]);
    expect(enriched.reaction_intelligence.candidate_reaction_neighbors).toEqual([
      expect.objectContaining({
        edge_id: "candidate-edge::a::b",
        basis: ["rdkit_fingerprint_tanimoto"]
      })
    ]);
    expect(enriched.reaction_intelligence.semantic_reaction_groups).toEqual([
      expect.objectContaining({
        group_id: "semantic-reaction-group::a::b",
        basis_summary: ["semantic_family_support", "semantic_procedure_support"]
      })
    ]);
  });

  it("warns instead of silently dropping invalid reaction intelligence groups", () => {
    const index = buildIndex();
    const artifact: ReactionIntelligenceArtifact = {
      ...computedArtifact(),
      strict_reaction_clusters: [
        {
          cluster_id: "strict-reaction-cluster::unknown",
          reaction_entity_ids: [rxnA, "rxn::missing"],
          representative_reaction_entity_id: rxnA,
          mean_score: 0.84,
          min_edge_score: 0.82,
          basis_summary: ["hybrid_consensus"],
          warnings: []
        }
      ],
      candidate_reaction_neighbors: [
        {
          edge_id: "candidate-edge::unknown",
          from_reaction_entity_id: rxnA,
          to_reaction_entity_id: "rxn::missing",
          score: 0.62,
          basis: ["rdkit_fingerprint_tanimoto"],
          warnings: []
        }
      ],
      semantic_reaction_groups: [
        {
          group_id: "semantic-reaction-group::unknown",
          reaction_entity_ids: ["rxn::missing"],
          mean_score: 0.9,
          basis_summary: ["semantic_family_support"],
          warnings: []
        }
      ]
    };

    const enriched = mergeReactionIntelligenceArtifactIntoGraphIndex(index, artifact);

    expect(enriched.reaction_intelligence.strict_reaction_clusters).toEqual([]);
    expect(enriched.reaction_intelligence.candidate_reaction_neighbors).toEqual([]);
    expect(enriched.reaction_intelligence.semantic_reaction_groups).toEqual([]);
    expect(enriched.reaction_intelligence.warnings).toEqual(expect.arrayContaining([
      "strict_reaction_cluster_not_merged:strict-reaction-cluster::unknown",
      "candidate_reaction_neighbor_not_merged:candidate-edge::unknown",
      "semantic_reaction_group_not_merged:semantic-reaction-group::unknown"
    ]));
  });

  it("keeps semantic-only warnings when no artifact is available", () => {
    const index = buildIndex();
    const enriched = mergeReactionIntelligenceArtifactIntoGraphIndex(index);
    const semanticEdge = enriched.reaction_similarity_edges.find((edge) =>
      edge.from_reaction_entity_id === rxnA && edge.to_reaction_entity_id === rxnB
    );

    expect(enriched.warnings).toContain("computed_reaction_fingerprints_not_available");
    expect(semanticEdge?.warnings).toEqual(["semantic_similarity_without_computed_fingerprint"]);
    expect(enriched.reaction_intelligence.computed_features).toEqual([]);
    expect(enriched.reaction_intelligence.computed_similarity_edges).toEqual([]);
    expect(enriched.reaction_intelligence.warnings).toEqual([
      "reaction_intelligence_artifact_not_available"
    ]);
  });

  it("does not invent computed chemistry when providers are skipped", () => {
    const index = buildIndex();
    const skippedArtifact: ReactionIntelligenceArtifact = {
      ...computedArtifact(),
      artifact_id: "ri-artifact-skip",
      job_id: "ri-job-skip",
      provider_statuses: [
        {
          provider: "rdkit_fingerprint",
          status: "SKIP",
          reason_code: "dependency_unavailable",
          message: "RDKit is not installed",
          warnings: ["rdkit_provider_unavailable"]
        }
      ],
      computed_features: [],
      computed_similarity_edges: [],
      warnings: ["computed_features_skipped"]
    };
    const enriched = mergeReactionIntelligenceArtifactIntoGraphIndex(index, skippedArtifact);

    expect(enriched.reaction_similarity_edges[0]?.warnings).toEqual([
      "semantic_similarity_without_computed_fingerprint"
    ]);
    expect(enriched.reaction_intelligence.computed_features).toEqual([]);
    expect(enriched.reaction_intelligence.computed_similarity_edges).toEqual([]);
    expect(enriched.reaction_intelligence.warnings).toEqual(expect.arrayContaining([
      "computed_features_skipped",
      "provider_skipped:rdkit_fingerprint",
      "rdkit_provider_unavailable"
    ]));
  });

  it("merges DRFP features and similarity edges into the reaction intelligence layer", () => {
    const index = buildIndex();
    const artifact: ReactionIntelligenceArtifact = {
      schema_version: "chemd-reaction-intelligence-artifact/v0.1",
      artifact_id: "artifact-drfp",
      job_id: "job-drfp",
      provider_statuses: [
        {
          provider: "drfp",
          status: "OK",
          warnings: []
        }
      ],
      computed_features: [
        {
          feature_id: "ri-feature::rxn-a::drfp",
          reaction_entity_id: rxnA,
          provider: "drfp",
          feature_kind: "drfp_reaction_fingerprint",
          status: "AVAILABLE",
          source: "computed_artifact",
          fingerprint_ref: "drfp::rxn-a::abc",
          warnings: [],
          metadata: { on_bits: [1, 8, 13], dimension: 2048 }
        }
      ],
      computed_similarity_edges: [
        {
          edge_id: "reaction-similarity::drfp",
          from_reaction_entity_id: rxnA,
          to_reaction_entity_id: rxnB,
          basis: ["hybrid_computed", "drfp_tanimoto"],
          score: 0.82,
          source: "computed_artifact",
          contributions: [
            {
              basis: "drfp_tanimoto",
              provider: "drfp",
              score: 0.82,
              weight: 0.3,
              warnings: []
            }
          ],
          warnings: []
        }
      ],
      clusters: [
        {
          cluster_id: "cluster-drfp",
          reaction_entity_ids: [rxnA, rxnB],
          representative_reaction_entity_id: rxnA,
          mean_score: 0.82,
          basis_summary: ["hybrid_computed", "drfp_tanimoto"],
          warnings: [],
          metadata: { threshold: 0.72 }
        }
      ],
      warnings: []
    };
    const merged = mergeReactionIntelligenceArtifactIntoGraphIndex(index, artifact);

    expect(merged.reaction_intelligence.provider_statuses[0]?.provider).toBe("drfp");
    expect(merged.reaction_intelligence.computed_features[0]?.feature_kind).toBe(
      "drfp_reaction_fingerprint"
    );
    expect(merged.reaction_intelligence.computed_similarity_edges[0]?.basis).toContain(
      "drfp_tanimoto"
    );
    expect(merged.reaction_intelligence.clusters?.[0]).toMatchObject({
      cluster_id: "cluster-drfp",
      reaction_entity_ids: [rxnA, rxnB],
      representative_reaction_entity_id: rxnA
    });
  });
});
