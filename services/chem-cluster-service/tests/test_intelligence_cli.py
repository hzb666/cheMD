# ruff: noqa: E402

import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.cli import main


class ReactionIntelligenceCliTests(unittest.TestCase):
    def test_invalid_input_exits_one_and_writes_envelope(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "job.json"
            output_path = Path(tmp) / "artifact.json"
            input_path.write_text('{"schema_version":"wrong"}', encoding="utf-8")

            exit_code = main(["--input", str(input_path), "--output", str(output_path), "--pretty"])

            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 1)
            self.assertEqual(payload["status"], "ERROR")
            self.assertEqual(payload["code"], "invalid_input")
            self.assertIn("schema_version is invalid", payload["errors"])

    def test_provider_and_missing_dependency_overrides_drive_exit_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "job.json"
            output_path = Path(tmp) / "artifact.json"
            input_path.write_text(json.dumps(job_for(["rdkit_fingerprint"])), encoding="utf-8")

            exit_code = main(
                [
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                    "--providers",
                    "rxnfp",
                    "--missing-dependency",
                    "error",
                ],
                provider_factory=fake_factory,
            )

            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(exit_code, 2)
            self.assertEqual(payload["providers"][0]["kind"], "rxnfp")
            self.assertEqual(payload["providers"][0]["status"], "ERROR")

    def test_pretty_output_writes_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_path = Path(tmp) / "job.json"
            output_path = Path(tmp) / "artifact.json"
            input_path.write_text(json.dumps(job_for(["rxnfp"])), encoding="utf-8")

            exit_code = main(
                [
                    "--input",
                    str(input_path),
                    "--output",
                    str(output_path),
                    "--pretty",
                    "--missing-dependency",
                    "skip",
                ],
                provider_factory=fake_factory,
            )

            raw_output = output_path.read_text(encoding="utf-8")
            payload = json.loads(raw_output)
            self.assertEqual(exit_code, 0)
            self.assertIn("\n  ", raw_output)
            self.assertEqual(payload["providers"][0]["status"], "SKIP")


def fake_factory(provider_kind):
    return lambda reactions: {
        "provider": {
            "provider_id": "provider::rxnfp",
            "kind": provider_kind,
            "status": "SKIP",
            "warnings": ["dependency_not_installed"],
        },
        "reaction_features": [],
        "similarity_edges": [],
        "warnings": ["dependency_not_installed"],
    }


def job_for(providers: list[str]) -> dict[str, Any]:
    return {
        "schema_version": "chemd-reaction-intelligence-job/v0.1",
        "job_id": "reaction-intelligence-job::cli",
        "graph_index_id": "graph-index::cli",
        "source_compile_run_ids": ["compile-run::cli"],
        "reactions": [
            {
                "reaction_entity_id": "rxn-cli",
                "document_id": "doc-cli",
                "canonical_rxn_smiles": "CCO>>CC=O",
                "participant_signature": "cli",
                "source_hash": "sha256:cli",
            }
        ],
        "requested_providers": providers,
        "provider_policy": {
            "missing_dependency": "skip",
            "per_reaction_failure": "warn",
            "allow_network": False,
        },
    }


if __name__ == "__main__":
    unittest.main()
