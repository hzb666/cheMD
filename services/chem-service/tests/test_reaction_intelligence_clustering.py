from __future__ import annotations

import hashlib
import json
import unittest

from chem_service.reaction_intelligence.clustering import assign_similarity_clusters


def _cluster_id(reaction_ids: list[str]) -> str:
    payload = json.dumps(sorted(reaction_ids), ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


class ReactionIntelligenceClusteringTest(unittest.TestCase):
    def test_assign_clusters_from_similarity_edges(self) -> None:
        clusters = assign_similarity_clusters(
            reaction_ids=["rxn-a", "rxn-b", "rxn-c", "rxn-d"],
            edges=[
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-b",
                    "score": 0.9,
                    "basis": ["hybrid_computed", "drfp_tanimoto"],
                    "warnings": [],
                },
                {
                    "from_reaction_entity_id": "rxn-c",
                    "to_reaction_entity_id": "rxn-d",
                    "score": 0.65,
                    "basis": ["hybrid_computed", "drfp_tanimoto"],
                    "warnings": [],
                },
            ],
            threshold=0.72,
            min_cluster_size=2,
        )

        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]["cluster_id"], _cluster_id(["rxn-a", "rxn-b"]))
        self.assertEqual(clusters[0]["reaction_entity_ids"], ["rxn-a", "rxn-b"])
        self.assertEqual(clusters[0]["representative_reaction_entity_id"], "rxn-a")
        self.assertEqual(clusters[0]["mean_score"], 0.9)

    def test_representative_uses_weighted_degree_then_reaction_id(self) -> None:
        clusters = assign_similarity_clusters(
            reaction_ids=["rxn-c", "rxn-a", "rxn-b"],
            edges=[
                {
                    "from_reaction_id": "rxn-a",
                    "to_reaction_id": "rxn-b",
                    "score": 0.8,
                    "basis": ["rxnfp_cosine"],
                    "warnings": ["from-edge-b"],
                },
                {
                    "from_reaction_id": "rxn-b",
                    "to_reaction_id": "rxn-c",
                    "score": 0.9,
                    "basis": ["drfp_tanimoto", "hybrid_computed"],
                    "warnings": ["from-edge-c", "from-edge-b"],
                },
            ],
            threshold=0.72,
        )

        self.assertEqual(len(clusters), 1)
        self.assertEqual(clusters[0]["reaction_entity_ids"], ["rxn-a", "rxn-b", "rxn-c"])
        self.assertEqual(clusters[0]["representative_reaction_entity_id"], "rxn-b")
        self.assertEqual(clusters[0]["mean_score"], 0.85)
        self.assertEqual(
            clusters[0]["basis_summary"],
            ["drfp_tanimoto", "hybrid_computed", "rxnfp_cosine"],
        )
        self.assertEqual(clusters[0]["warnings"], ["from-edge-b", "from-edge-c"])
        self.assertEqual(
            clusters[0]["metadata"],
            {"threshold": 0.72, "min_cluster_size": 2, "edge_count": 2},
        )

    def test_min_cluster_size_filters_small_components(self) -> None:
        clusters = assign_similarity_clusters(
            reaction_ids=["rxn-a", "rxn-b", "rxn-c"],
            edges=[
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-b",
                    "score": 1.0,
                    "basis": ["drfp_tanimoto"],
                    "warnings": [],
                }
            ],
            min_cluster_size=3,
        )

        self.assertEqual(clusters, [])

    def test_ignores_unknown_malformed_and_below_threshold_edges(self) -> None:
        clusters = assign_similarity_clusters(
            reaction_ids=["rxn-a", "rxn-b"],
            edges=[
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-b",
                    "score": 0.71,
                },
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-missing",
                    "score": 0.99,
                },
                {
                    "from_reaction_entity_id": "rxn-a",
                    "to_reaction_entity_id": "rxn-b",
                    "score": "0.99",
                },
            ],
        )

        self.assertEqual(clusters, [])


if __name__ == "__main__":
    unittest.main()
