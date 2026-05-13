from __future__ import annotations

import unittest

from chem_service.reaction_intelligence.providers.drfp_fingerprint import (
    DrfpFingerprintProvider,
    DrfpProviderUnavailable,
    fingerprint_drfp,
)


class FakeDrfpEncoder:
    @staticmethod
    def encode(reactions: list[str], n_folded_length: int = 2048) -> list[list[int]]:
        assert reactions == ["CCO.O=C(O)C>>CCOC(=O)C"]
        assert n_folded_length == 2048
        return [[0, 1, 0, 1, 1]]


class FakeOnBitsDrfpEncoder:
    @staticmethod
    def encode(_reactions: list[str], n_folded_length: int = 2048) -> list[list[int]]:
        assert n_folded_length == 2048
        return [[1, 3, 4]]


class ReactionIntelligenceDrfpProviderTest(unittest.TestCase):
    def test_drfp_provider_uses_injected_encoder(self) -> None:
        provider = DrfpFingerprintProvider(encoder_loader=lambda: FakeDrfpEncoder)

        results = provider.fingerprint_reactions(
            [
                {
                    "reaction_id": "rxn-1",
                    "reaction_smiles": "CCO.O=C(O)C>>CCOC(=O)C",
                }
            ]
        )

        self.assertEqual(results[0]["provider"], "drfp")
        self.assertEqual(results[0]["status"], "ok")
        self.assertEqual(results[0]["reaction_id"], "rxn-1")
        self.assertEqual(results[0]["on_bits"], [1, 3, 4])
        self.assertEqual(results[0]["fingerprint"], [1, 3, 4])
        self.assertEqual(results[0]["dimension"], 5)
        self.assertTrue(results[0]["fingerprint_ref"].startswith("drfp::rxn-1::"))
        self.assertEqual(len(results[0]["fingerprint_hash"]), 64)
        self.assertEqual(results[0]["metadata"]["encoding"], "on_bits")
        self.assertEqual(results[0]["warnings"], [])

    def test_drfp_provider_accepts_injected_encoder_instance(self) -> None:
        results = DrfpFingerprintProvider(encoder=FakeOnBitsDrfpEncoder()).fingerprint_reactions(
            [{"reaction_id": "rxn-1", "rxn_smiles": "CCO>>CC=O"}]
        )

        self.assertEqual(results[0]["status"], "ok")
        self.assertEqual(results[0]["on_bits"], [1, 3, 4])
        self.assertEqual(results[0]["dimension"], 5)

    def test_drfp_provider_skips_when_dependency_missing(self) -> None:
        def unavailable() -> None:
            raise DrfpProviderUnavailable("DRFP is not available: missing")

        provider = DrfpFingerprintProvider(encoder_loader=unavailable)

        results = provider.fingerprint_reactions(
            [{"reaction_id": "rxn-1", "reaction_smiles": "A>>B"}]
        )

        self.assertEqual(results[0]["status"], "skipped")
        self.assertEqual(results[0]["dimension"], 0)
        self.assertIsNone(results[0]["fingerprint_ref"])
        self.assertIsNone(results[0]["fingerprint_hash"])
        self.assertIn("DRFP is not available", results[0]["warnings"][0])

    def test_drfp_provider_dependency_skip_does_not_require_reaction_id(self) -> None:
        def unavailable() -> None:
            raise DrfpProviderUnavailable("DRFP is not available: missing")

        results = DrfpFingerprintProvider(encoder_loader=unavailable).fingerprint_reactions(
            [{"reaction_smiles": "A>>B"}]
        )

        self.assertEqual(results[0]["status"], "skipped")
        self.assertEqual(results[0]["reaction_id"], "unknown")
        self.assertIn("DRFP is not available", results[0]["warnings"][0])

    def test_drfp_provider_skips_missing_reaction_smiles(self) -> None:
        results = DrfpFingerprintProvider(encoder=FakeDrfpEncoder()).fingerprint_reactions(
            [{"reaction_id": "rxn-missing"}]
        )

        self.assertEqual(results[0]["status"], "skipped")
        self.assertEqual(results[0]["on_bits"], [])
        self.assertIn("reaction SMILES is missing", results[0]["warnings"][0])

    def test_drfp_provider_reports_missing_reaction_id(self) -> None:
        results = DrfpFingerprintProvider(encoder=FakeDrfpEncoder()).fingerprint_reactions(
            [{"rxn_smiles": "CCO>>CC=O"}]
        )

        self.assertEqual(results[0]["status"], "failed")
        self.assertEqual(results[0]["reaction_id"], "unknown")
        self.assertIn("reaction_id is required", results[0]["warnings"][0])

    def test_drfp_provider_reports_invalid_encoder_output(self) -> None:
        class InvalidEncoder:
            @staticmethod
            def encode(_reactions: list[str], n_folded_length: int = 2048) -> list[str]:
                return ["not-a-vector"]

        results = DrfpFingerprintProvider(encoder=InvalidEncoder()).fingerprint_reactions(
            [{"reaction_id": "rxn-1", "rxn_smiles": "CCO>>CC=O"}]
        )

        self.assertEqual(results[0]["status"], "failed")
        self.assertEqual(results[0]["dimension"], 0)
        self.assertIn("sequence", results[0]["warnings"][0])

    def test_fingerprint_drfp_uses_provider_facade(self) -> None:
        results = fingerprint_drfp(
            [{"reaction_id": "rxn-1", "reaction_smiles": "CCO.O=C(O)C>>CCOC(=O)C"}],
            encoder_loader=lambda: FakeDrfpEncoder,
        )

        self.assertEqual(results[0]["status"], "ok")
        self.assertEqual(results[0]["provider"], "drfp")


if __name__ == "__main__":
    unittest.main()
