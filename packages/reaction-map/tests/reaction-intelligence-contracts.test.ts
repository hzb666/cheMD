import { describe, expect, it } from "vitest";

import type { ChemdTrainingGraphIndexV1, TrainingReactionGraphFeatureV1 } from "@chemd/exporter-training";
import {
  buildReactionIntelligenceJobInputFromGraphIndex,
  validateReactionIntelligenceArtifact,
  validateReactionIntelligenceJobInput,
  type ChemdReactionIntelligenceArtifactV1
} from "../src/index";

const reactionFeature = (
  reactionEntityId: string,
  family: "esterification" | "cross_coupling",
  participantSignature: string
): TrainingReactionGraphFeatureV1 => ({
  reaction_entity_id: reactionEntityId,
  document_id: family === "esterification" ? "doc-ester" : "doc-suzuki",
  reaction_signature: `${family}::${participantSignature}`,
  participant_signature: participantSignature,
  fingerprint_status: "not_available",
  chemistry_feature_ref_ids: [],
  cluster_keys: [{ basis: "reaction_family", key: family }],
  changed_variable_fields: [],
  controlled_variable_fields: [],
  procedure_signature: family === "cross_coupling" ? "suzuki-coupling" : "fischer-esterification",
  reaction_family: family
});

const graphIndexFixture = (): ChemdTrainingGraphIndexV1 => ({
  schema_version: "chemd-training-graph-index/v0.1",
  index_scope: {
    document_ids: ["doc-ester", "doc-suzuki"],
    sources: [
      { document_id: "doc-ester", file_path: "ester.chemd.md", content_hash: "hash-doc-ester" },
      { document_id: "doc-suzuki", file_path: "suzuki.chemd.md", content_hash: "hash-doc-suzuki" }
    ]
  },
  nodes: [],
  edges: [],
  reaction_features: [
    reactionFeature("rxn-ester-1", "esterification", "acetic-acid+ethanol=>ethyl-acetate"),
    reactionFeature("rxn-ester-2", "esterification", "benzoic-acid+methanol=>methyl-benzoate"),
    reactionFeature("rxn-suzuki-1", "cross_coupling", "aryl-bromide+phenylboronic-acid=>biaryl"),
    reactionFeature("rxn-suzuki-2", "cross_coupling", "aryl-chloride+boronate=>biaryl")
  ],
  reaction_clusters: [],
  reaction_similarity_edges: [],
  warnings: []
});

const reactionSources = {
  "rxn-ester-1": {
    canonical_rxn_smiles: "CC(=O)O.CCO>>CC(=O)OCC",
    source_hash: "sha256:ester-1"
  },
  "rxn-ester-2": {
    canonical_rxn_smiles: "O=C(O)c1ccccc1.CO>>COC(=O)c1ccccc1",
    source_hash: "sha256:ester-2"
  },
  "rxn-suzuki-1": {
    canonical_rxn_smiles: "B(O)(O)c1ccccc1.Brc1ccccc1>>c1ccc(-c2ccccc2)cc1",
    source_hash: "sha256:suzuki-1"
  },
  "rxn-suzuki-2": {
    canonical_rxn_smiles: "Clc1ccc(Br)cc1.COB(O)OC>>c1ccc(-c2ccccc2)cc1",
    source_hash: "sha256:suzuki-2"
  }
};

const artifactFixture = (): ChemdReactionIntelligenceArtifactV1 => ({
  schema_version: "chemd-reaction-intelligence-artifact/v0.1",
  artifact_id: "reaction-intelligence-artifact::fixture",
  job_id: "reaction-intelligence-job::fixture",
  graph_index_id: "graph-index::fixture",
  generated_at: "2026-05-13T00:00:00.000Z",
  providers: [
    {
      provider_id: "provider::rdkit-fingerprint",
      kind: "rdkit_fingerprint",
      status: "SKIP",
      package_name: "rdkit",
      warnings: ["dependency_not_installed"]
    },
    {
      provider_id: "provider::hybrid-graph",
      kind: "hybrid_graph",
      status: "PASS",
      warnings: []
    }
  ],
  reaction_features: [
    {
      reaction_entity_id: "rxn-ester-1",
      source_hash: "sha256:ester-1",
      canonical_rxn_smiles: "CC(=O)O.CCO>>CC(=O)OCC",
      fingerprint_refs: [
        {
          feature_ref_id: "feature-ref::ester-1::rdkit",
          provider: "rdkit",
          kind: "bit_vector",
          dimension: 2048,
          storage: "sidecar_file",
          hash: "sha256:fp-ester-1"
        }
      ],
      warnings: []
    }
  ],
  similarity_edges: [
    {
      edge_id: "computed-edge::ester-1::ester-2",
      from_reaction_entity_id: "rxn-ester-1",
      to_reaction_entity_id: "rxn-ester-2",
      score: 0.82,
      confidence: "medium",
      basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
      provider_ids: ["provider::rdkit-fingerprint", "provider::hybrid-graph"],
      source_hashes: ["sha256:ester-1", "sha256:ester-2"],
      warnings: []
    }
  ],
  warnings: []
});

describe("reaction intelligence contracts", () => {
  it("builds a job input from an existing training graph index fixture", () => {
    const job = buildReactionIntelligenceJobInputFromGraphIndex(graphIndexFixture(), {
      job_id: "reaction-intelligence-job::fixture",
      graph_index_id: "graph-index::fixture",
      requested_providers: ["rdkit_fingerprint", "rxnmapper", "rxnfp", "hybrid_graph", "tmap_layout"],
      reaction_sources: reactionSources
    });

    expect(validateReactionIntelligenceJobInput(job)).toEqual([]);
    expect(job.reactions.map((reaction) => reaction.reaction_entity_id)).toEqual([
      "rxn-ester-1",
      "rxn-ester-2",
      "rxn-suzuki-1",
      "rxn-suzuki-2"
    ]);
    expect(job.provider_policy).toEqual({
      missing_dependency: "skip",
      per_reaction_failure: "warn",
      allow_network: false
    });
  });

  it("round-trips job input JSON without losing required fields", () => {
    const job = buildReactionIntelligenceJobInputFromGraphIndex(graphIndexFixture(), {
      job_id: "reaction-intelligence-job::fixture",
      graph_index_id: "graph-index::fixture",
      requested_providers: ["rdkit_fingerprint", "hybrid_graph"],
      reaction_sources: reactionSources
    });
    const roundTripped = JSON.parse(JSON.stringify(job));

    expect(validateReactionIntelligenceJobInput(roundTripped)).toEqual([]);
    expect(roundTripped.reactions[2]).toMatchObject({
      reaction_entity_id: "rxn-suzuki-1",
      canonical_rxn_smiles: reactionSources["rxn-suzuki-1"].canonical_rxn_smiles,
      source_hash: "sha256:suzuki-1"
    });
  });

  it("validates artifact provider status, computed feature, and computed edge fields", () => {
    const artifact = JSON.parse(JSON.stringify(artifactFixture()));

    expect(validateReactionIntelligenceArtifact(artifact)).toEqual([]);
    expect(artifact.providers.map((provider: { status: string }) => provider.status)).toEqual(["SKIP", "PASS"]);
    expect(artifact.reaction_features[0].fingerprint_refs[0]).toMatchObject({
      provider: "rdkit",
      kind: "bit_vector",
      dimension: 2048
    });
    expect(artifact.similarity_edges[0]).toMatchObject({
      basis: ["rdkit_fingerprint_tanimoto", "hybrid_consensus"],
      confidence: "medium"
    });
  });

  it("reports required field validation errors for invalid reaction input", () => {
    const job = buildReactionIntelligenceJobInputFromGraphIndex(graphIndexFixture(), {
      job_id: "reaction-intelligence-job::fixture",
      graph_index_id: "graph-index::fixture",
      requested_providers: ["rdkit_fingerprint"],
      reaction_sources: reactionSources
    });
    const invalid = {
      ...job,
      reactions: [{ ...job.reactions[0], canonical_rxn_smiles: "", source_hash: "" }]
    };

    expect(validateReactionIntelligenceJobInput(invalid)).toEqual([
      "reactions[0].canonical_rxn_smiles is required",
      "reactions[0].source_hash is required"
    ]);
  });
});
