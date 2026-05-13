import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.cli import main
from chem_cluster_service.layout import (
    ClusterWorkerError,
    normalize_worker_input,
    run_layout_worker,
)


class ClusterWorkerTests(unittest.TestCase):
    def test_missing_tmap_returns_skip_by_default(self):
        with patch("chem_cluster_service.layout.has_tmap", return_value=False):
            result = run_layout_worker({"reactions": ["rxn-a"]})

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.payload["status"], "SKIP")
        self.assertEqual(result.payload["code"], "tmap_dependency_missing")

    def test_fallback_outputs_worker_layout_artifact(self):
        result = run_layout_worker(
            {"layout_id": "layout-a", "reactions": ["rxn-b", "rxn-a"]},
            engine="fallback",
        )

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.payload["layout_engine"], "worker")
        self.assertEqual(
            [item["reaction_entity_id"] for item in result.payload["positions"]],
            ["rxn-a", "rxn-b"],
        )
        self.assertIn("deterministic_fallback_layout_used", result.payload["warnings"])

    def test_invalid_input_is_error(self):
        with self.assertRaises(ClusterWorkerError):
            normalize_worker_input({"reactions": ["rxn-a", 1]})

    def test_layout_artifact_input_is_supported(self):
        worker_input = normalize_worker_input(
            {
                "schema_version": "chemd-reaction-cluster-layout/v0.1",
                "layout_id": "layout-artifact",
                "nodes": [{"reaction_entity_id": "rxn-a"}],
                "edges": [],
            }
        )

        self.assertEqual(worker_input["layout_id"], "layout-artifact")
        self.assertEqual(worker_input["reactions"], ["rxn-a"])

    def test_cli_writes_error_for_invalid_json_shape(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / "input.json"
            output_path = Path(tmpdir) / "output.json"
            input_path.write_text(json.dumps({"reactions": ["rxn-a", 2]}), encoding="utf-8")

            exit_code = main(["--input", str(input_path), "--output", str(output_path)])
            payload = json.loads(output_path.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 2)
        self.assertEqual(payload["status"], "ERROR")
        self.assertEqual(payload["code"], "invalid_input")


if __name__ == "__main__":
    unittest.main()
