from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from chem_service.reaction_intelligence import cli
from chem_service.reaction_intelligence.providers import tmap_layout


class FakeTmap:
    class LayoutConfiguration:
        pass

    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    def layout_from_edge_list(
        self,
        vertex_count: int,
        edges: list[tuple[int, int, float]],
        *,
        config: object,
        create_mst: bool,
    ):
        self.calls.append(
            {
                "vertex_count": vertex_count,
                "edges": edges,
                "config": config,
                "create_mst": create_mst,
            }
        )
        return [0.0, 2.0, 4.0], [1.0, 3.0, 5.0], [0, 1], [1, 2], {"fake": True}


class ReactionIntelligenceTmapLayoutTest(unittest.TestCase):
    def test_missing_tmap_provider_returns_skip_status(self) -> None:
        job = {
            "reactionIds": ["rxn-a", "rxn-b"],
            "similarityEdges": [{"source": "rxn-a", "target": "rxn-b", "score": 0.75}],
        }

        with patch.object(
            tmap_layout.importlib,
            "import_module",
            side_effect=ImportError("missing"),
        ):
            result = tmap_layout.build_tmap_layout(job)

        self.assertEqual(result["provider"]["status"], "skipped")
        self.assertEqual(result["provider"]["reason"], "provider_unavailable")
        self.assertIsNone(result["layout"])

    def test_fake_tmap_layout_uses_stable_reaction_id_mapping(self) -> None:
        fake_tmap = FakeTmap()
        job = {
            "reactionIds": ["rxn-b", "rxn-a", "rxn-c"],
            "similarityEdges": [
                {"sourceReactionId": "rxn-a", "targetReactionId": "rxn-c", "score": 0.25},
                {"sourceReactionId": "rxn-b", "targetReactionId": "rxn-a", "score": 0.8},
            ],
        }

        result = tmap_layout.build_tmap_layout(job, tmap_module=fake_tmap)

        self.assertEqual(result["provider"]["status"], "computed")
        self.assertEqual(fake_tmap.calls[0]["vertex_count"], 3)
        self.assertEqual(fake_tmap.calls[0]["edges"], [(0, 1, 0.19999999999999996), (1, 2, 0.75)])
        layout = result["layout"]
        self.assertEqual(layout["diagnostics"]["vertexIndex"], {"rxn-b": 0, "rxn-a": 1, "rxn-c": 2})
        self.assertEqual(
            layout["positions"][1],
            {"reactionId": "rxn-a", "vertexIndex": 1, "x": 2.0, "y": 3.0},
        )
        self.assertEqual(layout["diagnostics"]["layoutEdgeCount"], 2)

    def test_edge_only_jobs_sort_discovered_reaction_ids(self) -> None:
        fake_tmap = FakeTmap()
        job = {
            "edges": [
                {"from": "rxn-c", "to": "rxn-a", "similarity": 0.5},
                {"from": "rxn-b", "to": "rxn-c", "similarity": 0.5},
            ]
        }

        result = tmap_layout.build_tmap_layout(job, tmap_module=fake_tmap)

        self.assertEqual(
            result["layout"]["diagnostics"]["vertexIndex"],
            {"rxn-a": 0, "rxn-b": 1, "rxn-c": 2},
        )
        self.assertEqual(fake_tmap.calls[0]["edges"], [(1, 2, 0.5), (2, 0, 0.5)])


class ReactionIntelligenceCliTest(unittest.TestCase):
    def test_cli_writes_parseable_json_when_provider_is_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            job_path = temp_path / "job.json"
            artifact_path = temp_path / "artifact.json"
            job_path.write_text(
                json.dumps(
                    {
                        "jobId": "job-1",
                        "reactionIds": ["rxn-a", "rxn-b"],
                        "similarityEdges": [
                            {"source": "rxn-a", "target": "rxn-b", "score": 0.9}
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with patch.object(
                cli,
                "build_tmap_layout",
                return_value={
                    "provider": {
                        "name": "tmap",
                        "status": "skipped",
                        "reason": "provider_unavailable",
                    },
                    "layout": None,
                    "warnings": [],
                },
            ):
                exit_code = cli.main([str(job_path), "--output", str(artifact_path)])

            artifact = json.loads(artifact_path.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 0)
        self.assertEqual(artifact["schemaVersion"], cli.ARTIFACT_SCHEMA_VERSION)
        self.assertEqual(artifact["jobId"], "job-1")
        self.assertEqual(artifact["providers"][0]["status"], "skipped")
        self.assertEqual(artifact["layouts"], [])
        self.assertEqual(artifact["diagnostics"]["reactionCount"], 2)

    def test_cli_returns_parseable_failure_artifact_for_invalid_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            job_path = temp_path / "job.json"
            artifact_path = temp_path / "artifact.json"
            job_path.write_text("{invalid", encoding="utf-8")

            exit_code = cli.main([str(job_path), "--output", str(artifact_path)])
            artifact = json.loads(artifact_path.read_text(encoding="utf-8"))

        self.assertEqual(exit_code, 2)
        self.assertEqual(artifact["providers"][0]["status"], "failed")
        self.assertEqual(artifact["providers"][0]["reason"], "invalid_job")


if __name__ == "__main__":
    unittest.main()
