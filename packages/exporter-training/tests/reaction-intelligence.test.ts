import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
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
