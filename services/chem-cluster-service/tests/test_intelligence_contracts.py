# ruff: noqa: E402

import json
import sys
import unittest
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.contracts import (
    ReactionIntelligenceContractError,
    require_valid_artifact,
    require_valid_job_input,
    validate_artifact,
    validate_job_input,
)

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


def read_fixture(name: str) -> dict:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


class ReactionIntelligenceContractTests(unittest.TestCase):
    def test_valid_job_fixture_round_trips(self):
        payload = read_fixture("reaction_intelligence_job.valid.json")
        round_tripped = json.loads(json.dumps(payload, sort_keys=True))

        self.assertEqual(validate_job_input(round_tripped), [])
        self.assertEqual(len(round_tripped["reactions"]), 4)
        self.assertEqual(
            [item["reaction_family"] for item in round_tripped["reactions"]],
            ["esterification", "esterification", "cross_coupling", "cross_coupling"],
        )
        self.assertFalse(round_tripped["provider_policy"]["allow_network"])

    def test_invalid_reaction_fixture_reports_required_fields(self):
        payload = read_fixture("reaction_intelligence_job.invalid.json")

        self.assertEqual(
            validate_job_input(payload),
            [
                "reactions[0].canonical_rxn_smiles is required",
                "reactions[0].source_hash is required",
            ],
        )

    def test_valid_artifact_fixture_round_trips_computed_fields(self):
        payload = read_fixture("reaction_intelligence_artifact.valid.json")
        round_tripped = json.loads(json.dumps(payload, sort_keys=True))

        self.assertEqual(validate_artifact(round_tripped), [])
        self.assertEqual(
            [provider["status"] for provider in round_tripped["providers"]],
            ["SKIP", "SKIP", "PASS"],
        )
        self.assertEqual(
            round_tripped["reaction_features"][0]["fingerprint_refs"][0]["provider"], "rdkit"
        )
        self.assertEqual(round_tripped["similarity_edges"][0]["basis"][1], "hybrid_consensus")

    def test_require_helpers_raise_classified_contract_error(self):
        payload = read_fixture("reaction_intelligence_job.invalid.json")

        with self.assertRaises(ReactionIntelligenceContractError):
            require_valid_job_input(payload)

        artifact = read_fixture("reaction_intelligence_artifact.valid.json")
        self.assertEqual(
            require_valid_artifact(artifact)["artifact_id"],
            "reaction-intelligence-artifact::fixture",
        )


if __name__ == "__main__":
    unittest.main()
