import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.providers.tmap_layout import (
    TmapAdapterInspection,
    TmapAdapterLayout,
    TmapLayoutProvider,
    run_tmap_layout_provider,
)


class MissingTmapAdapter:
    def inspect(self):
        return TmapAdapterInspection(available=False, warning="dependency_not_installed")

    def layout(self, vertex_count, edges):
        raise AssertionError("SKIP path must not call tmap layout")


class FakeTmapAdapter:
    def __init__(self):
        self.calls = []

    def inspect(self):
        return TmapAdapterInspection(
            available=True,
            package_version="fake-tmap-1.0",
            layout_engine="tmap-adapter",
        )

    def layout(self, vertex_count, edges):
        self.calls.append((vertex_count, list(edges)))
        return TmapAdapterLayout(
            positions={0: (0.0, 0.0), 1: (10.0, 1.5), 2: (4.0, 8.0)},
            mst_edges=[(0, 1, 0.91), (1, 2, 0.72)],
            warnings=["adapter_warning"],
        )


class FailingTmapAdapter(FakeTmapAdapter):
    def layout(self, vertex_count, edges):
        raise RuntimeError("boom")


class TmapLayoutProviderTests(unittest.TestCase):
    def test_default_provider_reports_skip_when_tmap_is_not_importable(self):
        with patch(
            "chem_cluster_service.intelligence.providers.tmap_layout.importlib.util.find_spec",
            return_value=None,
        ):
            inspection = TmapLayoutProvider().inspect()

        self.assertEqual(inspection["status"], "SKIP")
        self.assertEqual(inspection["kind"], "tmap_layout")
        self.assertEqual(inspection["package_name"], "tmap")
        self.assertEqual(inspection["warnings"], ["dependency_not_installed"])

    def test_missing_dependency_skips_without_running_layout(self):
        result = run_tmap_layout_provider(
            ["rxn-a", "rxn-b"],
            [computed_edge("rxn-a", "rxn-b", 0.91)],
            adapter=MissingTmapAdapter(),
        )

        self.assertEqual(result.provider["status"], "SKIP")
        self.assertIsNone(result.layout)
        self.assertEqual(result.warnings, ["dependency_not_installed"])

    def test_missing_dependency_error_policy_classifies_as_error(self):
        result = run_tmap_layout_provider(
            ["rxn-a"],
            [],
            adapter=MissingTmapAdapter(),
            missing_dependency="error",
        )

        self.assertEqual(result.provider["status"], "ERROR")
        self.assertIsNone(result.layout)
        self.assertEqual(result.warnings, ["dependency_not_installed"])

    def test_missing_dependency_fallback_emits_deterministic_layout(self):
        result = run_tmap_layout_provider(
            ["rxn-b", "rxn-a"],
            [computed_edge("rxn-a", "rxn-b", 0.83)],
            adapter=MissingTmapAdapter(),
            missing_dependency="fallback",
        )

        self.assertEqual(result.provider["status"], "SKIP")
        self.assertEqual(result.layout["layout_engine"], "deterministic-fallback")
        self.assertEqual(
            result.layout["vertex_index_by_reaction_entity_id"],
            {"rxn-b": 0, "rxn-a": 1},
        )
        self.assertEqual(result.layout["mst_edges"][0]["weight"], 0.83)
        self.assertIn("deterministic_fallback_layout_used", result.layout["warnings"])

    def test_injected_adapter_receives_vertex_edge_list_and_emits_artifact(self):
        adapter = FakeTmapAdapter()
        result = run_tmap_layout_provider(
            ["rxn-a", "rxn-b", "rxn-c"],
            [
                computed_edge("rxn-b", "rxn-a", 0.91, ["rxnfp_cosine"], ["edge_warning"]),
                computed_edge("rxn-b", "rxn-c", 0.72, ["hybrid_consensus"], []),
                computed_edge("rxn-a", "rxn-missing", 0.8),
            ],
            adapter=adapter,
        )

        self.assertEqual(adapter.calls, [(3, [(0, 1, 0.91), (1, 2, 0.72)])])
        self.assertEqual(result.provider["status"], "PASS")
        self.assertEqual(result.layout["layout_engine"], "tmap-adapter")
        self.assertEqual(result.layout["layout_engine_version"], "fake-tmap-1.0")
        self.assertEqual(result.layout["positions"][1]["reaction_entity_id"], "rxn-b")
        self.assertEqual(result.layout["positions"][1]["x"], 10.0)
        self.assertEqual(result.layout["mst_edges"][0]["basis"], ["rxnfp_cosine"])
        self.assertEqual(result.layout["mst_edges"][0]["warnings"], ["edge_warning"])
        self.assertEqual(
            result.layout["warnings"],
            ["tmap_layout_similarity_edge_skipped", "adapter_warning"],
        )

    def test_adapter_failure_is_reported_as_provider_error(self):
        result = run_tmap_layout_provider(
            ["rxn-a", "rxn-b"],
            [computed_edge("rxn-a", "rxn-b", 0.91)],
            adapter=FailingTmapAdapter(),
        )

        self.assertEqual(result.provider["status"], "ERROR")
        self.assertIsNone(result.layout)
        self.assertIn("tmap_layout_failed:RuntimeError", result.warnings)


def computed_edge(left, right, score, basis=None, warnings=None):
    return {
        "edge_id": f"computed-edge::{left}::{right}::test",
        "from_reaction_entity_id": left,
        "to_reaction_entity_id": right,
        "score": score,
        "confidence": "medium",
        "basis": basis or ["rdkit_fingerprint_tanimoto"],
        "provider_ids": ["provider::test"],
        "source_hashes": ["sha256:left", "sha256:right"],
        "warnings": warnings or [],
    }


if __name__ == "__main__":
    unittest.main()
