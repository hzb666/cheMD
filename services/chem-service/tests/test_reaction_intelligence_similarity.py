from __future__ import annotations

import unittest

from chem_service.reaction_intelligence.pipeline import build_reaction_intelligence_artifact
from chem_service.reaction_intelligence.providers.rxnfp_provider import (
    RxnfpProvider,
    RxnfpProviderUnavailable,
)
from chem_service.reaction_intelligence.similarity import (
    HybridSimilarityWeights,
    build_hybrid_similarity_edge,
    cosine_score,
    tanimoto_like_score,
)


class FakeRxnfpGenerator:
    def convert(self, reaction_smiles: str) -> list[float]:
        if reaction_smiles == "CCO>>CC=O":
            return [1.0, 0.0, 0.0]
        return [0.5, 0.5, 0.0]


class ReactionIntelligenceRxnfpProviderTest(unittest.TestCase):
    def test_rxnfp_provider_uses_fake_generator_and_emits_vector_metadata(self) -> None:
        results = RxnfpProvider(generator=FakeRxnfpGenerator()).embed_reactions(
            [
                {
                    "reaction_id": "rxn-1",
                    "rxn_smiles": "CCO>>CC=O",
                }
            ]
        )

        self.assertEqual(results[0]["status"], "ok")
        self.assertEqual(results[0]["provider"], "rxnfp")
        self.assertEqual(results[0]["reaction_id"], "rxn-1")
        self.assertEqual(results[0]["embedding"], [1.0, 0.0, 0.0])
        self.assertEqual(results[0]["dimension"], 3)
        self.assertTrue(results[0]["vector_ref"].startswith("rxnfp::rxn-1::"))
        self.assertEqual(len(results[0]["vector_hash"]), 64)
        self.assertEqual(results[0]["metadata"]["source"], "rxnfp_embedding")

    def test_rxnfp_provider_skips_when_lazy_import_is_unavailable(self) -> None:
        def unavailable() -> None:
            raise RxnfpProviderUnavailable("RXNFP is not installed")

        results = RxnfpProvider(generator_factory=unavailable).embed_reactions(
            [{"reaction_id": "rxn-1", "rxn_smiles": "CCO>>CC=O"}]
        )

        self.assertEqual(results[0]["status"], "skipped")
        self.assertEqual(results[0]["dimension"], 0)
        self.assertIsNone(results[0]["vector_ref"])
        self.assertIn("RXNFP is not installed", results[0]["warnings"][0])


class ReactionIntelligenceSimilarityTest(unittest.TestCase):
    def test_similarity_helpers_do_not_require_torch(self) -> None:
        self.assertEqual(cosine_score([1.0, 0.0], [1.0, 0.0]), 1.0)
        self.assertEqual(cosine_score([1.0, 0.0], [0.0, 1.0]), 0.0)
        self.assertAlmostEqual(tanimoto_like_score([1, 0, 1], [1, 1, 0]), 1 / 3)

    def test_hybrid_similarity_reports_provider_contributions(self) -> None:
        edge = build_hybrid_similarity_edge(
            left_reaction_id="rxn-1",
            right_reaction_id="rxn-2",
            semantic_score=0.6,
            left_results={
                "fingerprint": {
                    "status": "ok",
                    "fingerprint": [1, 0, 1],
                },
                "rxnfp": {
                    "status": "ok",
                    "embedding": [1.0, 0.0],
                },
                "reaction_center": {
                    "status": "ok",
                    "signature": "C-O>C=O",
                },
            },
            right_results={
                "fingerprint": {
                    "status": "ok",
                    "fingerprint": [1, 1, 0],
                },
                "rxnfp": {
                    "status": "ok",
                    "embedding": [0.8, 0.2],
                },
                "reaction_center": {
                    "status": "ok",
                    "signature": "C-O>C=O",
                },
            },
            weights=HybridSimilarityWeights(
                semantic=0.25,
                fingerprint=0.25,
                rxnfp=0.25,
                reaction_center=0.25,
            ),
        )

        self.assertTrue(edge["computed_chemistry"])
        self.assertEqual(
            edge["basis"],
            [
                "semantic_similarity",
                "fingerprint_tanimoto",
                "rxnfp_cosine",
                "reaction_center_overlap",
            ],
        )
        self.assertEqual(
            [contribution["provider"] for contribution in edge["contributions"]],
            ["semantic", "fingerprint", "rxnfp", "reaction_center"],
        )
        self.assertEqual(edge["warnings"], [])
        self.assertGreater(edge["score"], 0.7)

    def test_semantic_only_similarity_is_not_marked_computed_chemistry(self) -> None:
        edge = build_hybrid_similarity_edge(
            left_reaction_id="rxn-1",
            right_reaction_id="rxn-2",
            semantic_score=0.75,
            left_results={},
            right_results={},
        )

        self.assertFalse(edge["computed_chemistry"])
        self.assertEqual(edge["basis"], ["semantic_similarity"])
        self.assertIn("semantic_only_similarity_not_computed_chemistry", edge["warnings"])
        self.assertEqual(
            [contribution["status"] for contribution in edge["contributions"]],
            ["ok", "skipped", "skipped", "skipped"],
        )


class ReactionIntelligencePipelineTest(unittest.TestCase):
    def test_pipeline_marks_missing_providers_skipped_and_preserves_semantic_only_warning(
        self,
    ) -> None:
        artifact = build_reaction_intelligence_artifact(
            reactions=[
                {"reaction_id": "rxn-1"},
                {"reaction_id": "rxn-2"},
            ],
            semantic_edges=[
                {
                    "from_reaction_id": "rxn-1",
                    "to_reaction_id": "rxn-2",
                    "score": 0.7,
                }
            ],
        )

        self.assertEqual(artifact["schema_version"], "chemd-reaction-intelligence-artifact/v0.1")
        self.assertEqual(
            artifact["providers"],
            [
                {
                    "provider": "fingerprint",
                    "status": "skipped",
                    "warnings": ["fingerprint_provider_skipped"],
                },
                {
                    "provider": "rxnfp",
                    "status": "skipped",
                    "warnings": ["rxnfp_provider_skipped"],
                },
                {
                    "provider": "reaction_center",
                    "status": "skipped",
                    "warnings": ["reaction_center_provider_skipped"],
                },
            ],
        )
        self.assertFalse(artifact["similarity_edges"][0]["computed_chemistry"])
        self.assertIn("semantic_only_similarity_not_computed_chemistry", artifact["warnings"])

    def test_pipeline_combines_provider_results_into_computed_edges(self) -> None:
        rxnfp_results = RxnfpProvider(generator=FakeRxnfpGenerator()).embed_reactions(
            [
                {"reaction_id": "rxn-1", "rxn_smiles": "CCO>>CC=O"},
                {"reaction_id": "rxn-2", "rxn_smiles": "CCN>>CC=N"},
            ]
        )
        artifact = build_reaction_intelligence_artifact(
            reactions=[
                {"reaction_id": "rxn-1"},
                {"reaction_id": "rxn-2"},
            ],
            provider_results={
                "rxnfp": rxnfp_results,
                "fingerprint": [
                    {
                        "provider": "fingerprint",
                        "status": "ok",
                        "reaction_id": "rxn-1",
                        "fingerprint": [1, 0, 1],
                    },
                    {
                        "provider": "fingerprint",
                        "status": "ok",
                        "reaction_id": "rxn-2",
                        "fingerprint": [1, 1, 0],
                    },
                ],
            },
        )

        self.assertTrue(artifact["similarity_edges"][0]["computed_chemistry"])
        self.assertIn("fingerprint_tanimoto", artifact["similarity_edges"][0]["basis"])
        self.assertIn("rxnfp_cosine", artifact["similarity_edges"][0]["basis"])
        reaction_center = next(
            provider for provider in artifact["providers"] if provider["provider"] == "reaction_center"
        )
        self.assertEqual(reaction_center["status"], "skipped")
