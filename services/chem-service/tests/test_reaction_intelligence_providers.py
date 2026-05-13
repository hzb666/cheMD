from __future__ import annotations

import unittest

from chem_service.reaction_intelligence.contracts import (
    ReactionIntelligenceJob,
    ReactionIntelligenceReaction,
)
from chem_service.reaction_intelligence.providers.rdkit_fingerprint import (
    RdkitReactionFingerprintProvider,
    RdkitReactionToolkit,
)
from chem_service.reaction_intelligence.providers.rxnmapper_provider import RxnMapperProvider
from chem_service.reaction_intelligence.reaction_center import derive_reaction_center


def _job() -> ReactionIntelligenceJob:
    return ReactionIntelligenceJob(
        job_id="job-1",
        reactions=[
            ReactionIntelligenceReaction(
                reaction_id="rxn-1",
                reaction_smiles="CCO>>CC=O",
                reactants=["CCO"],
                products=["CC=O"],
            )
        ],
    )


class ReactionIntelligenceProviderTest(unittest.TestCase):
    def test_rdkit_provider_skips_when_dependency_is_unavailable(self) -> None:
        provider = RdkitReactionFingerprintProvider(toolkit_loader=lambda: None)

        artifact = provider.run(_job())

        self.assertEqual(artifact.provider_statuses[0].status, "skipped")
        self.assertEqual(artifact.fingerprints, [])
        self.assertIn("RDKit is not available", artifact.warnings[0])

    def test_rdkit_provider_uses_fake_toolkit_for_fingerprint_metadata(self) -> None:
        class FakeBitVector:
            def GetOnBits(self) -> list[int]:
                return [7, 2, 42]

            def GetNumBits(self) -> int:
                return 128

        class FakeReactions:
            @staticmethod
            def ReactionFromSmiles(reaction_smiles: str) -> dict[str, str]:
                return {"reaction_smiles": reaction_smiles}

            @staticmethod
            def CreateStructuralFingerprintForReaction(_reaction: object) -> FakeBitVector:
                return FakeBitVector()

        provider = RdkitReactionFingerprintProvider(
            toolkit_loader=lambda: RdkitReactionToolkit(reactions_module=FakeReactions),
        )

        artifact = provider.run(_job())

        self.assertEqual(artifact.provider_statuses[0].status, "ok")
        self.assertEqual(artifact.fingerprints[0].on_bits, [2, 7, 42])
        self.assertEqual(artifact.fingerprints[0].bit_count, 3)
        self.assertEqual(artifact.fingerprints[0].metadata["numBits"], 128)

    def test_rxnmapper_provider_skips_when_dependency_is_unavailable(self) -> None:
        provider = RxnMapperProvider(mapper_loader=lambda: None)

        artifact = provider.run(_job())

        self.assertEqual(artifact.provider_statuses[0].status, "skipped")
        self.assertEqual(artifact.atom_mappings, [])
        self.assertIn("RXNMapper is not available", artifact.warnings[0])

    def test_rxnmapper_provider_uses_fake_mapper_and_derives_center(self) -> None:
        class FakeMapper:
            def get_attention_guided_atom_maps(self, rxns: list[str]) -> list[dict[str, object]]:
                self.rxns = rxns
                return [
                    {
                        "mapped_rxn": "[CH3:1][OH:2]>>[CH2:1]=[O:2]",
                        "confidence": 0.91,
                        "warnings": ["fake mapper warning"],
                    }
                ]

        mapper = FakeMapper()
        provider = RxnMapperProvider(mapper_loader=lambda: mapper)

        artifact = provider.run(_job())

        self.assertEqual(mapper.rxns, ["CCO>>CC=O"])
        self.assertEqual(artifact.provider_statuses[0].status, "ok")
        mapping = artifact.atom_mappings[0]
        self.assertEqual(mapping.mapped_reaction, "[CH3:1][OH:2]>>[CH2:1]=[O:2]")
        self.assertEqual(mapping.confidence, 0.91)
        self.assertEqual(mapping.reaction_center.signature, "center::1:[CH3]->[CH2]|2:[OH]->[O]")
        self.assertEqual(mapping.reaction_center.changed_atom_maps, [1, 2])
        self.assertIn("fake mapper warning", mapping.warnings)

    def test_reaction_center_skips_low_confidence_mapping(self) -> None:
        center = derive_reaction_center(
            "rxn-low",
            "[CH3:1][OH:2]>>[CH2:1]=[O:2]",
            confidence=0.2,
        )

        self.assertEqual(center.status, "skipped")
        self.assertIsNone(center.signature)
        self.assertIn("below threshold", center.warnings[0])

    def test_reaction_center_skips_empty_mapping(self) -> None:
        center = derive_reaction_center("rxn-empty", None, confidence=None)

        self.assertEqual(center.status, "skipped")
        self.assertIsNone(center.signature)
        self.assertIn("empty", center.warnings[0])


if __name__ == "__main__":
    unittest.main()
