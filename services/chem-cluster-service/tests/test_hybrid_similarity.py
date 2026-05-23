# ruff: noqa: E402

import sys
import unittest
from dataclasses import dataclass
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.contracts import validate_artifact
from chem_cluster_service.intelligence.similarity import build_hybrid_similarity_edges


@dataclass(frozen=True)
class ProviderResult:
    similarity_edges: list[dict]


class HybridSimilarityTests(unittest.TestCase):
    def test_merges_semantic_and_computed_edges_with_weighted_score(self):
        edges = build_hybrid_similarity_edges(
            {
                "reaction_similarity_edges": [
                    semantic_edge("rxn-b", "rxn-a", 0.9, ["same_family_procedure"]),
                ],
            },
            [
                {
                    "similarity_edges": [
                        computed_edge("rxn-a", "rxn-b", 0.8, "rdkit_fingerprint_tanimoto")
                    ]
                },
                ProviderResult([computed_edge("rxn-b", "rxn-a", 0.95, "rxnfp_cosine")]),
                {
                    "similarity_edges": [
                        computed_edge("rxn-a", "rxn-b", 1.0, "same_reaction_center")
                    ]
                },
            ],
        )

        self.assertEqual(len(edges), 1)
        self.assertEqual(
            edges[0],
            {
                "edge_id": "computed-edge::rxn-a::rxn-b::hybrid-similarity",
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.9075,
                "confidence": "high",
                "basis": [
                    "semantic_family_support",
                    "semantic_procedure_support",
                    "rdkit_fingerprint_tanimoto",
                    "rxnfp_cosine",
                    "same_reaction_center",
                    "hybrid_consensus",
                ],
                "provider_ids": [
                    "provider::hybrid-graph",
                    "provider::rdkit-fingerprint",
                    "provider::rxnfp",
                    "provider::rxnmapper",
                ],
                "source_hashes": ["sha256:a", "sha256:b"],
                "contributions": [
                    {
                        "component": "semantic",
                        "score": 0.9,
                        "weight": 0.2,
                        "basis": ["semantic_family_support", "semantic_procedure_support"],
                    },
                    {
                        "component": "rdkit",
                        "score": 0.8,
                        "weight": 0.3,
                        "basis": ["rdkit_fingerprint_tanimoto"],
                    },
                    {
                        "component": "rxnfp",
                        "score": 0.95,
                        "weight": 0.25,
                        "basis": ["rxnfp_cosine"],
                    },
                    {
                        "component": "reaction_center",
                        "score": 1.0,
                        "weight": 0.25,
                        "basis": ["same_reaction_center"],
                    },
                ],
                "warnings": [],
            },
        )
        self.assertEqual(validate_artifact(artifact(edges)), [])

    def test_renormalizes_weights_when_provider_components_are_missing(self):
        edges = build_hybrid_similarity_edges(
            [semantic_edge("rxn-a", "rxn-b", 0.9, ["same_reaction_family"])],
            [computed_edge("rxn-a", "rxn-b", 0.6, "rdkit_fingerprint_tanimoto")],
        )

        self.assertEqual(edges[0]["score"], 0.72)
        self.assertEqual(edges[0]["confidence"], "medium")
        self.assertEqual(
            edges[0]["contributions"],
            [
                {
                    "component": "semantic",
                    "score": 0.9,
                    "weight": 0.2,
                    "basis": ["semantic_family_support"],
                },
                {
                    "component": "rdkit",
                    "score": 0.6,
                    "weight": 0.3,
                    "basis": ["rdkit_fingerprint_tanimoto"],
                },
            ],
        )
        self.assertEqual(
            edges[0]["basis"],
            ["semantic_family_support", "rdkit_fingerprint_tanimoto", "hybrid_consensus"],
        )

    def test_keeps_semantic_only_warning_and_low_confidence(self):
        edges = build_hybrid_similarity_edges(
            [semantic_edge("rxn-a", "rxn-b", 0.85, ["same_reaction_family"])],
            [],
        )

        self.assertEqual(edges[0]["score"], 0.85)
        self.assertEqual(edges[0]["confidence"], "low")
        self.assertEqual(edges[0]["provider_ids"], [])
        self.assertEqual(edges[0]["contributions"][0]["component"], "semantic")
        self.assertEqual(edges[0]["warnings"], ["semantic_similarity_without_computed_fingerprint"])

    def test_source_warnings_prevent_high_confidence(self):
        edges = build_hybrid_similarity_edges(
            [],
            [
                computed_edge(
                    "rxn-a",
                    "rxn-b",
                    0.99,
                    "rdkit_fingerprint_tanimoto",
                    warnings=[
                        "rdkit_fingerprint_invalid_reaction:reaction_smiles_contains_invalid_molecule"
                    ],
                )
            ],
        )

        self.assertEqual(edges[0]["score"], 0.99)
        self.assertEqual(edges[0]["confidence"], "medium")
        self.assertEqual(
            edges[0]["warnings"],
            ["rdkit_fingerprint_invalid_reaction:reaction_smiles_contains_invalid_molecule"],
        )

    def test_sorts_edges_and_uses_max_score_per_component(self):
        edges = build_hybrid_similarity_edges(
            [
                semantic_edge("rxn-c", "rxn-a", 0.55, ["same_reaction_family"]),
                semantic_edge("rxn-c", "rxn-a", 0.75, ["same_procedure_signature"]),
                semantic_edge("rxn-b", "rxn-a", 0.7, ["same_route"]),
            ],
            [computed_edge("rxn-c", "rxn-a", 0.9, "compatible_reaction_center")],
        )

        self.assertEqual(
            [item["edge_id"] for item in edges],
            [
                "computed-edge::rxn-a::rxn-b::hybrid-similarity",
                "computed-edge::rxn-a::rxn-c::hybrid-similarity",
            ],
        )
        self.assertEqual(edges[1]["score"], 0.833333)
        self.assertEqual(edges[1]["from_reaction_entity_id"], "rxn-a")
        self.assertEqual(edges[1]["to_reaction_entity_id"], "rxn-c")

    def test_skips_malformed_or_unmapped_edges_without_fabricating_facts(self):
        edges = build_hybrid_similarity_edges(
            [
                semantic_edge("rxn-a", "rxn-b", 0.8, ["legacy_unknown_basis"]),
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-c",
                    "basis": ["same_route"],
                },
                semantic_edge("rxn-b", "rxn-b", 0.9, ["same_reaction_family"]),
            ],
            [
                computed_edge("rxn-c", "rxn-a", 1.2, "rxnfp_cosine"),
            ],
        )

        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["from_reaction_entity_id"], "rxn-a")
        self.assertEqual(edges[0]["to_reaction_entity_id"], "rxn-c")
        self.assertEqual(edges[0]["score"], 1.0)
        self.assertEqual(edges[0]["basis"], ["rxnfp_cosine"])

    def test_marks_hard_reject_when_center_conflicts_with_low_rdkit_support(self):
        edges = build_hybrid_similarity_edges(
            [],
            [
                computed_edge("rxn-a", "rxn-b", 0.4, "rdkit_fingerprint_tanimoto"),
                computed_edge("rxn-a", "rxn-b", 0.0, "conflicting_reaction_center"),
            ],
        )

        self.assertEqual(edges[0]["score"], 0.218182)
        self.assertEqual(
            edges[0]["basis"],
            ["rdkit_fingerprint_tanimoto", "conflicting_reaction_center", "hybrid_consensus"],
        )
        self.assertIn("strict_cluster_hard_reject:reaction_center_conflict_low_rdkit", edges[0]["warnings"])
        self.assertEqual(edges[0]["confidence"], "low")


def semantic_edge(left, right, score, basis):
    return {
        "edge_id": f"reaction-similarity::{left}::{right}",
        "from_reaction_entity_id": left,
        "to_reaction_entity_id": right,
        "score": score,
        "basis": basis,
        "warnings": ["semantic_similarity_without_computed_fingerprint"],
    }


def computed_edge(left, right, score, basis, warnings=None):
    provider_ids = {
        "rdkit_fingerprint_tanimoto": ["provider::rdkit-fingerprint"],
        "rxnfp_cosine": ["provider::rxnfp"],
        "same_reaction_center": ["provider::rxnmapper"],
        "compatible_reaction_center": ["provider::rxnmapper"],
        "conflicting_reaction_center": ["provider::rxnmapper"],
    }[basis]
    return {
        "edge_id": f"computed-edge::{left}::{right}::{basis}",
        "from_reaction_entity_id": left,
        "to_reaction_entity_id": right,
        "score": score,
        "confidence": "high",
        "basis": [basis],
        "provider_ids": provider_ids,
        "source_hashes": [f"sha256:{left[-1]}", f"sha256:{right[-1]}"],
        "warnings": warnings or [],
    }


def artifact(edges):
    return {
        "schema_version": "chemd-reaction-intelligence-artifact/v0.1",
        "artifact_id": "reaction-intelligence-artifact::hybrid-test",
        "job_id": "reaction-intelligence-job::hybrid-test",
        "graph_index_id": "graph-index::hybrid-test",
        "generated_at": "2026-05-13T00:00:00.000Z",
        "providers": [
            {
                "provider_id": "provider::hybrid-graph",
                "kind": "hybrid_graph",
                "status": "PASS",
                "warnings": [],
            },
        ],
        "reaction_features": [],
        "similarity_edges": edges,
        "warnings": [],
    }


if __name__ == "__main__":
    unittest.main()
