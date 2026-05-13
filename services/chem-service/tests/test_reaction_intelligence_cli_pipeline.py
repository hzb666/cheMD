from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from chem_service.reaction_intelligence import cli


class ReactionIntelligenceCliPipelineTest(unittest.TestCase):
    def test_cli_writes_full_artifact_for_reaction_provider_job(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            job_path = temp_path / "job.json"
            artifact_path = temp_path / "artifact.json"
            job_path.write_text(json.dumps(_pipeline_job()), encoding="utf-8")

            with patch.object(
                cli,
                "compute_provider_results",
                return_value={
                    "drfp": [
                        {
                            "provider": "drfp",
                            "status": "ok",
                            "reaction_id": "rxn-1",
                            "fingerprint": [1, 2],
                            "fingerprint_ref": "drfp::rxn-1::a",
                            "dimension": 2048,
                            "warnings": [],
                        },
                        {
                            "provider": "drfp",
                            "status": "ok",
                            "reaction_id": "rxn-2",
                            "fingerprint": [2, 3],
                            "fingerprint_ref": "drfp::rxn-2::b",
                            "dimension": 2048,
                            "warnings": [],
                        },
                    ]
                },
            ):
                exit_code = cli.main([str(job_path), "--output", str(artifact_path)])

            artifact = json.loads(artifact_path.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(artifact["schema_version"], cli.ARTIFACT_SCHEMA_VERSION)
        self.assertEqual(artifact["job_id"], "job-drfp")
        self.assertEqual(artifact["provider_statuses"][0]["provider"], "drfp")
        self.assertEqual(artifact["provider_statuses"][0]["status"], "OK")
        self.assertEqual(
            artifact["computed_features"][0]["feature_kind"],
            "drfp_reaction_fingerprint",
        )
        self.assertIn("drfp_tanimoto", artifact["computed_similarity_edges"][0]["basis"])
        self.assertEqual(artifact["clusters"][0]["reaction_entity_ids"], ["rxn-1", "rxn-2"])
        self.assertNotIn("layout", artifact)


def _pipeline_job() -> dict[str, object]:
    return {
        "job_id": "job-drfp",
        "reactions": [
            {
                "reaction_id": "rxn-1",
                "reaction_smiles": "CCO.O=C(O)C>>CCOC(=O)C",
            },
            {
                "reaction_id": "rxn-2",
                "reaction_smiles": "CCN.O=C(O)C>>CCNC(=O)C",
            },
        ],
        "options": {
            "providers": ["drfp"],
            "cluster_threshold": 0.3,
            "layout": False,
        },
    }


if __name__ == "__main__":
    unittest.main()
