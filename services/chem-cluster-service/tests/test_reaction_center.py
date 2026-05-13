import sys
import unittest
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.reaction_center import (
    build_reaction_center_similarity_edges,
    derive_reaction_center,
)


ESTER_MAPPED = (
    "[CH3:1][C:2](=[O:3])[OH:4].[CH3:5][CH2:6][OH:7]"
    ">>[CH3:1][C:2](=[O:3])[O:7][CH2:6][CH3:5]"
)
ESTER_MAPPED_ALT = (
    "[CH3:10][C:11](=[O:12])[OH:13].[CH3:14][OH:15]"
    ">>[CH3:10][C:11](=[O:12])[O:15][CH3:14]"
)
SUBSTITUTION_MAPPED = "[Cl:1][CH3:2].[OH:3]>>[OH:3][CH3:2].[Cl:1]"


class ReactionCenterTests(unittest.TestCase):
    def test_extracts_explainable_center_from_mapped_reaction(self):
        center = derive_reaction_center(ESTER_MAPPED, 0.94)

        self.assertEqual(center["provider"], "rxnmapper_derived")
        self.assertEqual(center["confidence"], "high")
        self.assertEqual(center["center_signature"], "bonds:broken:C-O:single|formed:C-O:single")
        self.assertEqual(center["changed_bonds"], ["broken:C2-O4:single", "formed:C2-O7:single"])
        self.assertEqual(center["changed_atoms"], ["C2", "O4", "O7"])
        self.assertEqual(center["warnings"], [])

    def test_unmapped_or_ambiguous_reaction_returns_low_confidence_warning(self):
        center = derive_reaction_center("CCO>>CC=O", 0.98)

        self.assertEqual(center["center_signature"], "unresolved")
        self.assertEqual(center["confidence"], "low")
        self.assertIn("mapped_reaction_has_no_atom_maps", center["warnings"])

    def test_low_mapping_confidence_cannot_be_high_confidence_center(self):
        center = derive_reaction_center(ESTER_MAPPED, 0.42)

        self.assertEqual(center["confidence"], "low")
        self.assertIn("low_mapping_confidence", center["warnings"])

    def test_builds_same_and_compatible_reaction_center_edges(self):
        features = [
            _feature("rxn-a", "sha256:a", derive_reaction_center(ESTER_MAPPED, 0.94)),
            _feature("rxn-b", "sha256:b", derive_reaction_center(ESTER_MAPPED_ALT, 0.91)),
            _feature("rxn-c", "sha256:c", derive_reaction_center(SUBSTITUTION_MAPPED, 0.82)),
        ]

        edges = build_reaction_center_similarity_edges(features)

        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["basis"], ["same_reaction_center"])
        self.assertEqual(edges[0]["confidence"], "high")
        self.assertEqual(edges[0]["from_reaction_entity_id"], "rxn-a")
        self.assertEqual(edges[0]["to_reaction_entity_id"], "rxn-b")

    def test_low_confidence_edge_is_not_marked_high(self):
        features = [
            _feature("rxn-a", "sha256:a", derive_reaction_center(ESTER_MAPPED, 0.94)),
            _feature("rxn-b", "sha256:b", derive_reaction_center(ESTER_MAPPED_ALT, 0.4)),
        ]

        edges = build_reaction_center_similarity_edges(features)

        self.assertEqual(edges[0]["confidence"], "low")
        self.assertIn("low_confidence_reaction_center_edge", edges[0]["warnings"])


def _feature(reaction_id, source_hash, reaction_center):
    return {
        "reaction_entity_id": reaction_id,
        "source_hash": source_hash,
        "canonical_rxn_smiles": reaction_id,
        "fingerprint_refs": [],
        "reaction_center": reaction_center,
        "warnings": [],
    }


if __name__ == "__main__":
    unittest.main()
