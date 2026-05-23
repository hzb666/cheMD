# ruff: noqa: E402

import sys
import unittest
from importlib.util import find_spec
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.providers.rdkit_fingerprint import (
    RdkitAdapterInspection,
    RdkitFingerprintProvider,
    ReactionFingerprintError,
    ReactionFingerprint,
    run_rdkit_fingerprint_provider,
)


class MissingRdkitAdapter:
    def inspect(self):
        return RdkitAdapterInspection(
            available=False,
            package_version=None,
            warning="dependency_not_installed",
        )

    def fingerprint_reaction(self, canonical_rxn_smiles, path_dimension, morgan_dimension):
        raise AssertionError("SKIP path must not fingerprint reactions")


class FakeRdkitAdapter:
    def __init__(self):
        self.calls = []

    def inspect(self):
        return RdkitAdapterInspection(
            available=True,
            package_version="fake-rdkit-1.0",
        )

    def fingerprint_reaction(self, canonical_rxn_smiles, path_dimension, morgan_dimension):
        self.calls.append((canonical_rxn_smiles, path_dimension, morgan_dimension))
        if canonical_rxn_smiles == "invalid>>":
            raise ReactionFingerprintError("reaction_smiles_contains_invalid_molecule")
        fingerprints = {
            "A>>B": ({1, 2}, {5, 6}),
            "A>>C": ({1, 2}, {5, 7}),
            "D>>E": ({10, 11}, {12, 13}),
        }
        reactant_bits, product_bits = fingerprints[canonical_rxn_smiles]
        return ReactionFingerprint.from_side_bits(
            set(reactant_bits),
            set(product_bits),
            side_dimension=path_dimension + morgan_dimension,
        )


def reactions():
    return [
        {
            "reaction_entity_id": "rxn-a",
            "document_id": "doc-a",
            "canonical_rxn_smiles": "A>>B",
            "participant_signature": "a-to-b",
            "source_hash": "sha256:a",
        },
        {
            "reaction_entity_id": "rxn-b",
            "document_id": "doc-b",
            "canonical_rxn_smiles": "A>>C",
            "participant_signature": "a-to-c",
            "source_hash": "sha256:b",
        },
        {
            "reaction_entity_id": "rxn-c",
            "document_id": "doc-c",
            "canonical_rxn_smiles": "D>>E",
            "participant_signature": "d-to-e",
            "source_hash": "sha256:c",
        },
    ]


class RdkitFingerprintProviderTests(unittest.TestCase):
    @unittest.skipIf(find_spec("rdkit") is not None, "RDKit is installed in this environment")
    def test_default_provider_reports_skip_when_rdkit_is_not_importable(self):
        provider = RdkitFingerprintProvider()

        self.assertEqual(provider.inspect()["status"], "SKIP")
        self.assertEqual(provider.inspect()["warnings"], ["dependency_not_installed"])

    def test_inspect_returns_skip_when_rdkit_is_missing(self):
        provider = RdkitFingerprintProvider(adapter=MissingRdkitAdapter())

        self.assertEqual(
            provider.inspect(),
            {
                "provider_id": "provider::rdkit-fingerprint",
                "kind": "rdkit_fingerprint",
                "status": "SKIP",
                "package_name": "rdkit",
                "warnings": ["dependency_not_installed"],
            },
        )

    def test_missing_rdkit_skips_without_processing_reactions(self):
        result = run_rdkit_fingerprint_provider(
            reactions(),
            adapter=MissingRdkitAdapter(),
        )

        self.assertEqual(result["provider"]["status"], "SKIP")
        self.assertEqual(result["reaction_features"], [])
        self.assertEqual(result["similarity_edges"], [])
        self.assertEqual(result["warnings"], ["dependency_not_installed"])

    def test_fingerprint_refs_are_traceable_inline_bit_vectors(self):
        adapter = FakeRdkitAdapter()
        result = run_rdkit_fingerprint_provider(
            [reactions()[0]],
            adapter=adapter,
        )

        self.assertEqual(adapter.calls, [("A>>B", 1024, 1024)])
        self.assertEqual(result["provider"]["status"], "PASS")
        self.assertEqual(result["provider"]["package_version"], "fake-rdkit-1.0")
        feature = result["reaction_features"][0]
        self.assertEqual(feature["reaction_entity_id"], "rxn-a")
        self.assertEqual(feature["source_hash"], "sha256:a")
        self.assertEqual(feature["canonical_rxn_smiles"], "A>>B")
        self.assertEqual(feature["warnings"], [])
        self.assertEqual(len(feature["fingerprint_refs"]), 1)
        fingerprint_ref = feature["fingerprint_refs"][0]
        self.assertTrue(fingerprint_ref["feature_ref_id"].startswith("feature-ref::rxn-a::rdkit::"))
        self.assertEqual(fingerprint_ref["provider"], "rdkit")
        self.assertEqual(fingerprint_ref["kind"], "bit_vector")
        self.assertEqual(fingerprint_ref["algorithm"], "rdkit_reaction_composite_6144_v2")
        self.assertEqual(fingerprint_ref["dimension"], 6144)
        self.assertEqual(fingerprint_ref["storage"], "inline")
        self.assertTrue(fingerprint_ref["hash"].startswith("sha256:"))
        self.assertEqual(
            fingerprint_ref["bit_indices"],
            [1, 2, 2053, 2054, 4097, 4098, 4101, 4102],
        )
        self.assertEqual(
            fingerprint_ref["block_dimensions"],
            {
                "path": 1024,
                "morgan": 1024,
                "side": 2048,
                "reactant": 2048,
                "product": 2048,
                "change": 2048,
            },
        )
        self.assertEqual(
            fingerprint_ref["block_bit_indices"],
            {
                "reactant": [1, 2],
                "product": [5, 6],
                "change": [1, 2, 5, 6],
            },
        )
        self.assertEqual(
            fingerprint_ref["block_weights"],
            {"reactant": 0.25, "product": 0.25, "change": 0.5},
        )

    def test_tanimoto_edges_are_computed_for_valid_reactions(self):
        result = run_rdkit_fingerprint_provider(
            reactions(),
            adapter=FakeRdkitAdapter(),
        )

        self.assertEqual(len(result["reaction_features"]), 3)
        edges = result["similarity_edges"]
        self.assertEqual(len(edges), 1)
        self.assertEqual(
            edges[0],
            {
                "edge_id": "computed-edge::rxn-a::rxn-b::rdkit-fingerprint-tanimoto",
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.633333,
                "confidence": "low",
                "basis": ["rdkit_fingerprint_tanimoto"],
                "provider_ids": ["provider::rdkit-fingerprint"],
                "source_hashes": ["sha256:a", "sha256:b"],
                "metadata": {
                    "algorithm": "rdkit_reaction_composite_6144_v2",
                    "block_similarity": {
                        "reactant": 1.0,
                        "product": 0.333333,
                        "change": 0.6,
                    },
                    "block_weights": {"reactant": 0.25, "product": 0.25, "change": 0.5},
                },
                "warnings": [],
            },
        )

    def test_invalid_reaction_smiles_adds_per_reaction_warning_and_continues_batch(self):
        items = reactions() + [
            {
                "reaction_entity_id": "rxn-invalid",
                "document_id": "doc-invalid",
                "canonical_rxn_smiles": "invalid>>",
                "participant_signature": "invalid",
                "source_hash": "sha256:invalid",
            },
        ]

        result = run_rdkit_fingerprint_provider(
            items,
            adapter=FakeRdkitAdapter(),
        )

        self.assertEqual(result["provider"]["status"], "PASS")
        self.assertIn("rdkit_fingerprint_reaction_warning_count:1", result["provider"]["warnings"])
        invalid_feature = result["reaction_features"][-1]
        self.assertEqual(invalid_feature["reaction_entity_id"], "rxn-invalid")
        self.assertEqual(invalid_feature["fingerprint_refs"], [])
        self.assertEqual(
            invalid_feature["warnings"],
            ["rdkit_fingerprint_invalid_reaction:reaction_smiles_contains_invalid_molecule"],
        )
        self.assertEqual(len(result["similarity_edges"]), 1)


if __name__ == "__main__":
    unittest.main()
