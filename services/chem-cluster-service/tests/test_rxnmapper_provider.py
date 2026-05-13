import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.providers.rxnmapper_provider import RXNMapperProvider


class FakeMapperAdapter:
    def __init__(self, results_by_smiles):
        self.results_by_smiles = results_by_smiles

    def map_reactions(self, reaction_smiles):
        results = []
        for smiles in reaction_smiles:
            result = self.results_by_smiles[smiles]
            if isinstance(result, Exception):
                raise result
            results.append(result)
        return results


class RXNMapperProviderTests(unittest.TestCase):
    def test_inspect_skips_when_rxnmapper_is_missing(self):
        with patch("importlib.util.find_spec", return_value=None):
            provider = RXNMapperProvider()

            inspection = provider.inspect()

        self.assertEqual(inspection["status"], "SKIP")
        self.assertEqual(inspection["kind"], "rxnmapper")
        self.assertIn("dependency_not_installed", inspection["warnings"])

    def test_injected_adapter_allows_tests_without_real_dependency(self):
        provider = RXNMapperProvider(mapper_adapter=FakeMapperAdapter({"A>>B": _mapping(0.91)}))

        result = provider.run([_reaction("rxn-a", "A>>B", "sha256:a")])

        self.assertEqual(result.provider["status"], "PASS")
        self.assertEqual(len(result.reaction_features), 1)
        feature = result.reaction_features[0]
        self.assertEqual(feature["atom_mapping"]["mapped_rxn"], _MAPPED_RXN)
        self.assertEqual(feature["atom_mapping"]["confidence"], 0.91)
        self.assertTrue(feature["atom_mapping"]["mapping_hash"].startswith("sha256:"))
        self.assertEqual(feature["reaction_center"]["provider"], "rxnmapper_derived")

    def test_low_confidence_empty_result_and_single_exception_are_warnings(self):
        adapter = FakeMapperAdapter(
            {
                "low>>result": _mapping(0.42),
                "empty>>result": {},
                "bad>>result": RuntimeError("boom"),
            }
        )
        provider = RXNMapperProvider(mapper_adapter=adapter, batch_size=3)

        result = provider.run(
            [
                _reaction("rxn-low", "low>>result", "sha256:low"),
                _reaction("rxn-empty", "empty>>result", "sha256:empty"),
                _reaction("rxn-bad", "bad>>result", "sha256:bad"),
            ]
        )

        features = {item["reaction_entity_id"]: item for item in result.reaction_features}
        self.assertIn("rxnmapper_low_confidence", features["rxn-low"]["warnings"])
        self.assertIn("low_mapping_confidence", features["rxn-low"]["reaction_center"]["warnings"])
        self.assertIn("rxnmapper_empty_result", features["rxn-empty"]["warnings"])
        self.assertIn("rxnmapper_reaction_failed:RuntimeError", features["rxn-bad"]["warnings"])
        self.assertNotIn("atom_mapping", features["rxn-empty"])
        self.assertNotIn("atom_mapping", features["rxn-bad"])

    def test_missing_dependency_run_returns_skip_without_loading_mapper(self):
        with patch("importlib.util.find_spec", return_value=None):
            result = RXNMapperProvider().run([_reaction("rxn-a", "A>>B", "sha256:a")])

        self.assertEqual(result.provider["status"], "SKIP")
        self.assertEqual(result.reaction_features, [])
        self.assertEqual(result.similarity_edges, [])
        self.assertIn("dependency_not_installed", result.warnings)

    def test_run_returns_reaction_center_edges_from_features(self):
        adapter = FakeMapperAdapter(
            {
                "first>>ester": _mapping(0.93),
                "second>>ester": _mapping(0.91, mapped_rxn=_MAPPED_RXN_ALT),
            }
        )
        provider = RXNMapperProvider(mapper_adapter=adapter)

        result = provider.run(
            [
                _reaction("rxn-a", "first>>ester", "sha256:a"),
                _reaction("rxn-b", "second>>ester", "sha256:b"),
            ]
        )

        self.assertEqual(len(result.similarity_edges), 1)
        self.assertEqual(result.similarity_edges[0]["basis"], ["same_reaction_center"])
        self.assertEqual(result.similarity_edges[0]["confidence"], "high")

    def test_run_does_not_mark_low_confidence_reaction_center_edge_high(self):
        adapter = FakeMapperAdapter(
            {
                "first>>ester": _mapping(0.93),
                "second>>ester": _mapping(0.41, mapped_rxn=_MAPPED_RXN_ALT),
            }
        )
        provider = RXNMapperProvider(mapper_adapter=adapter)

        result = provider.run(
            [
                _reaction("rxn-a", "first>>ester", "sha256:a"),
                _reaction("rxn-b", "second>>ester", "sha256:b"),
            ]
        )

        self.assertEqual(len(result.similarity_edges), 1)
        self.assertEqual(result.similarity_edges[0]["confidence"], "low")
        self.assertIn("low_confidence_reaction_center_edge", result.similarity_edges[0]["warnings"])


def _reaction(reaction_id, smiles, source_hash):
    return {
        "reaction_entity_id": reaction_id,
        "document_id": "doc",
        "canonical_rxn_smiles": smiles,
        "participant_signature": reaction_id,
        "source_hash": source_hash,
    }


_MAPPED_RXN = (
    "[CH3:1][C:2](=[O:3])[OH:4].[CH3:5][CH2:6][OH:7]"
    ">>[CH3:1][C:2](=[O:3])[O:7][CH2:6][CH3:5]"
)
_MAPPED_RXN_ALT = (
    "[CH3:10][C:11](=[O:12])[OH:13].[CH3:14][OH:15]"
    ">>[CH3:10][C:11](=[O:12])[O:15][CH3:14]"
)


def _mapping(confidence, mapped_rxn=_MAPPED_RXN):
    return {"mapped_rxn": mapped_rxn, "confidence": confidence}


if __name__ == "__main__":
    unittest.main()
