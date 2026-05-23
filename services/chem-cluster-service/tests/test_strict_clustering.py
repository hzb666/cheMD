# ruff: noqa: E402

import sys
import unittest
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.clustering import build_reaction_similarity_groups


class StrictClusteringTests(unittest.TestCase):
    def test_builds_strict_clusters_from_strong_computed_edges(self):
        result = build_reaction_similarity_groups(
            ["rxn-a", "rxn-b", "rxn-c"],
            [
                edge("rxn-a", "rxn-b", 0.84, ["rdkit_fingerprint_tanimoto"]),
                edge("rxn-b", "rxn-c", 0.91, ["rxnfp_cosine", "same_reaction_center"]),
            ],
        )

        self.assertEqual(result["candidate_reaction_neighbors"], [])
        self.assertEqual(result["semantic_reaction_groups"], [])
        self.assertEqual(
            result["strict_reaction_clusters"],
            [
                {
                    "cluster_id": "strict-reaction-cluster::rxn-a::rxn-b::rxn-c",
                    "reaction_entity_ids": ["rxn-a", "rxn-b", "rxn-c"],
                    "representative_reaction_entity_id": "rxn-b",
                    "mean_score": 0.875,
                    "min_edge_score": 0.84,
                    "basis_summary": [
                        "rdkit_fingerprint_tanimoto",
                        "rxnfp_cosine",
                        "same_reaction_center",
                    ],
                    "warnings": [],
                }
            ],
        )

    def test_keeps_weak_computed_edges_as_candidate_neighbors(self):
        result = build_reaction_similarity_groups(
            ["rxn-a", "rxn-b"],
            [
                edge("rxn-a", "rxn-b", 0.62, ["rdkit_fingerprint_tanimoto"]),
            ],
        )

        self.assertEqual(result["strict_reaction_clusters"], [])
        self.assertEqual(result["semantic_reaction_groups"], [])
        self.assertEqual(result["candidate_reaction_neighbors"][0]["edge_id"], "edge::rxn-a::rxn-b")

    def test_keeps_semantic_only_edges_out_of_strict_clusters(self):
        result = build_reaction_similarity_groups(
            ["rxn-a", "rxn-b"],
            [
                edge(
                    "rxn-a",
                    "rxn-b",
                    0.9,
                    ["semantic_family_support", "semantic_procedure_support"],
                    warnings=["semantic_similarity_without_computed_fingerprint"],
                ),
            ],
        )

        self.assertEqual(result["strict_reaction_clusters"], [])
        self.assertEqual(result["candidate_reaction_neighbors"], [])
        self.assertEqual(
            result["semantic_reaction_groups"],
            [
                {
                    "group_id": "semantic-reaction-group::rxn-a::rxn-b",
                    "reaction_entity_ids": ["rxn-a", "rxn-b"],
                    "mean_score": 0.9,
                    "basis_summary": ["semantic_family_support", "semantic_procedure_support"],
                    "warnings": ["semantic_similarity_without_computed_fingerprint"],
                }
            ],
        )

    def test_excludes_hard_reject_edges_from_strict_clusters(self):
        result = build_reaction_similarity_groups(
            ["rxn-a", "rxn-b"],
            [
                edge(
                    "rxn-a",
                    "rxn-b",
                    0.9,
                    [
                        "rdkit_fingerprint_tanimoto",
                        "conflicting_reaction_center",
                        "hybrid_consensus",
                    ],
                    warnings=["strict_cluster_hard_reject:reaction_center_conflict_low_rdkit"],
                ),
            ],
        )

        self.assertEqual(result["strict_reaction_clusters"], [])
        self.assertEqual(result["semantic_reaction_groups"], [])
        self.assertEqual(result["candidate_reaction_neighbors"][0]["warnings"], [
            "strict_cluster_hard_reject:reaction_center_conflict_low_rdkit"
        ])


def edge(left, right, score, basis, warnings=None):
    return {
        "edge_id": f"edge::{left}::{right}",
        "from_reaction_entity_id": left,
        "to_reaction_entity_id": right,
        "score": score,
        "confidence": "medium",
        "basis": basis,
        "provider_ids": ["provider::hybrid-graph"],
        "source_hashes": [],
        "warnings": warnings or [],
    }


if __name__ == "__main__":
    unittest.main()
