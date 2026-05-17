# ruff: noqa: E402

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.providers.rxnfp_provider import (
    RxnfpAdapterInspection,
    RxnfpProvider,
    run_rxnfp_provider,
)


class MissingRxnfpAdapter:
    def inspect(self):
        return RxnfpAdapterInspection(
            available=False,
            package_version=None,
            warning="dependency_not_installed",
        )

    def embed_reactions(self, canonical_rxn_smiles, batch_size):
        raise AssertionError("SKIP path must not embed reactions")


class FakeRxnfpAdapter:
    def __init__(self, embeddings_by_smiles):
        self.embeddings_by_smiles = embeddings_by_smiles
        self.calls = []

    def inspect(self):
        return RxnfpAdapterInspection(
            available=True,
            package_version="fake-rxnfp-1.0",
            model_id="fake-rxnfp-model",
            device="cpu",
            batch_size=2,
        )

    def embed_reactions(self, canonical_rxn_smiles, batch_size):
        self.calls.append((list(canonical_rxn_smiles), batch_size))
        results = []
        for smiles in canonical_rxn_smiles:
            result = self.embeddings_by_smiles[smiles]
            if isinstance(result, Exception):
                raise result
            results.append(result)
        return results


class RxnfpProviderTests(unittest.TestCase):
    def test_inspect_skips_when_rxnfp_is_missing(self):
        with patch("importlib.util.find_spec", return_value=None):
            inspection = RxnfpProvider().inspect()

        self.assertEqual(inspection["status"], "SKIP")
        self.assertEqual(inspection["kind"], "rxnfp")
        self.assertEqual(inspection["package_name"], "rxnfp")
        self.assertEqual(inspection["model_id"], "rxnfp/default-rxnbert")
        self.assertEqual(inspection["device"], "cpu")
        self.assertEqual(inspection["batch_size"], 32)
        self.assertIn("dependency_not_installed", inspection["warnings"])

    def test_missing_dependency_run_returns_skip_without_embedding(self):
        result = run_rxnfp_provider(
            [_reaction("rxn-a", "A>>B", "sha256:a")],
            embedding_adapter=MissingRxnfpAdapter(),
        )

        self.assertEqual(result.provider["status"], "SKIP")
        self.assertEqual(result.reaction_features, [])
        self.assertEqual(result.similarity_edges, [])
        self.assertEqual(result.warnings, ["dependency_not_installed"])

    def test_injected_adapter_emits_traceable_inline_float_embedding_ref(self):
        adapter = FakeRxnfpAdapter({"A>>B": [0.1, 0.2, 0.3]})

        result = run_rxnfp_provider(
            [_reaction("rxn-a", "A>>B", "sha256:a")],
            embedding_adapter=adapter,
            batch_size=2,
            storage="inline",
        )

        self.assertEqual(adapter.calls, [(["A>>B"], 2)])
        self.assertEqual(result.provider["status"], "PASS")
        self.assertEqual(result.provider["package_version"], "fake-rxnfp-1.0")
        self.assertEqual(result.provider["model_id"], "fake-rxnfp-model")
        self.assertEqual(result.provider["device"], "cpu")
        self.assertEqual(result.provider["batch_size"], 2)
        feature = result.reaction_features[0]
        self.assertEqual(feature["reaction_entity_id"], "rxn-a")
        self.assertEqual(feature["source_hash"], "sha256:a")
        self.assertEqual(feature["canonical_rxn_smiles"], "A>>B")
        self.assertEqual(feature["warnings"], [])
        embedding_ref = feature["fingerprint_refs"][0]
        self.assertTrue(embedding_ref["feature_ref_id"].startswith("feature-ref::rxn-a::rxnfp::"))
        self.assertEqual(embedding_ref["provider"], "rxnfp")
        self.assertEqual(embedding_ref["kind"], "float_embedding")
        self.assertEqual(embedding_ref["dimension"], 3)
        self.assertEqual(embedding_ref["storage"], "inline")
        self.assertEqual(embedding_ref["embedding"], [0.1, 0.2, 0.3])
        self.assertEqual(embedding_ref["model_id"], "fake-rxnfp-model")
        self.assertTrue(embedding_ref["hash"].startswith("sha256:"))

    def test_sidecar_file_storage_is_default_for_embedding_refs(self):
        result = run_rxnfp_provider(
            [_reaction("rxn-a", "A>>B", "sha256:a")],
            embedding_adapter=FakeRxnfpAdapter({"A>>B": [0.1, 0.2]}),
        )

        embedding_ref = result.reaction_features[0]["fingerprint_refs"][0]
        self.assertEqual(embedding_ref["storage"], "sidecar_file")
        self.assertIn("sidecar_key", embedding_ref)
        self.assertNotIn("embedding", embedding_ref)

    def test_cosine_edges_are_top_k_and_use_rxnfp_basis(self):
        result = run_rxnfp_provider(
            [
                _reaction("rxn-a", "A>>B", "sha256:a"),
                _reaction("rxn-b", "A>>C", "sha256:b"),
                _reaction("rxn-c", "D>>E", "sha256:c"),
            ],
            embedding_adapter=FakeRxnfpAdapter(
                {
                    "A>>B": [1.0, 0.0],
                    "A>>C": [0.9, 0.1],
                    "D>>E": [0.0, 1.0],
                }
            ),
            top_k=1,
        )

        self.assertEqual(len(result.similarity_edges), 1)
        self.assertEqual(
            result.similarity_edges[0],
            {
                "edge_id": "computed-edge::rxn-a::rxn-b::rxnfp-cosine",
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.993884,
                "confidence": "high",
                "basis": ["rxnfp_cosine"],
                "provider_ids": ["provider::rxnfp"],
                "source_hashes": ["sha256:a", "sha256:b"],
                "warnings": [],
            },
        )

    def test_dimension_mismatch_marks_provider_error_and_skips_edges(self):
        result = run_rxnfp_provider(
            [
                _reaction("rxn-a", "A>>B", "sha256:a"),
                _reaction("rxn-b", "A>>C", "sha256:b"),
            ],
            embedding_adapter=FakeRxnfpAdapter(
                {
                    "A>>B": [1.0, 0.0],
                    "A>>C": [1.0, 0.0, 0.0],
                }
            ),
        )

        self.assertEqual(result.provider["status"], "ERROR")
        self.assertEqual(result.similarity_edges, [])
        self.assertIn("rxnfp_embedding_dimension_mismatch:2,3", result.provider["warnings"])

    def test_batch_failure_is_reported_as_warning_without_edges(self):
        result = run_rxnfp_provider(
            [_reaction("rxn-a", "bad>>rxn", "sha256:a")],
            embedding_adapter=FakeRxnfpAdapter({"bad>>rxn": RuntimeError("boom")}),
        )

        self.assertEqual(result.provider["status"], "PASS")
        self.assertEqual(result.similarity_edges, [])
        self.assertIn("rxnfp_batch_failed:RuntimeError", result.provider["warnings"])
        self.assertIn("rxnfp_no_valid_embeddings", result.provider["warnings"])
        self.assertEqual(
            result.reaction_features[0]["warnings"],
            ["rxnfp_batch_failed:RuntimeError"],
        )


def _reaction(reaction_id, smiles, source_hash):
    return {
        "reaction_entity_id": reaction_id,
        "document_id": "doc",
        "canonical_rxn_smiles": smiles,
        "participant_signature": reaction_id,
        "source_hash": source_hash,
    }


if __name__ == "__main__":
    unittest.main()
