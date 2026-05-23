# ruff: noqa: E402

import json
import sys
import unittest
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from chem_cluster_service.intelligence.contracts import validate_artifact
from chem_cluster_service.intelligence.pipeline import run_reaction_intelligence_pipeline

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"


class HybridClusteringGoldTests(unittest.TestCase):
    def test_gold_cases_preserve_strict_clustering_contract(self):
        for case in read_gold_cases():
            with self.subTest(case=case["id"]):
                result = run_reaction_intelligence_pipeline(
                    job_for(case),
                    provider_factory=fake_factory(case),
                    clock=fixed_clock,
                )

                self.assertEqual(result.exit_code, 0)
                self.assertEqual(validate_artifact(result.payload), [])
                expected = case["expected"]
                self.assertEqual(
                    len(result.payload["strict_reaction_clusters"]),
                    expected["strict_cluster_count"],
                )
                self.assertEqual(
                    len(result.payload["candidate_reaction_neighbors"]),
                    expected["candidate_neighbor_count"],
                )
                self.assertEqual(
                    len(result.payload["semantic_reaction_groups"]),
                    expected["semantic_group_count"],
                )
                warnings = collect_warnings(result.payload)
                for warning in expected["required_warnings"]:
                    self.assertIn(warning, warnings)


def read_gold_cases() -> list[dict[str, Any]]:
    payload = json.loads((FIXTURE_ROOT / "hybrid_clustering_gold_cases.json").read_text())
    return payload["cases"]


def job_for(case: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema_version": "chemd-reaction-intelligence-job/v0.1",
        "job_id": f"reaction-intelligence-job::{case['id']}",
        "graph_index_id": f"graph-index::{case['id']}",
        "source_compile_run_ids": ["compile-run::gold"],
        "reactions": [reaction("rxn-a"), reaction("rxn-b")],
        "reaction_similarity_edges": [
            semantic_edge(item) for item in case.get("semantic_edges", [])
        ],
        "requested_providers": case["requested_providers"],
        "provider_policy": {
            "missing_dependency": "skip",
            "per_reaction_failure": "warn",
            "allow_network": False,
        },
    }


def reaction(reaction_id: str) -> dict[str, str]:
    return {
        "reaction_entity_id": reaction_id,
        "document_id": "doc-gold",
        "canonical_rxn_smiles": "CCO>>CC=O",
        "participant_signature": reaction_id,
        "source_hash": f"sha256:{reaction_id}",
    }


def semantic_edge(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "edge_id": f"semantic-edge::{item['left']}::{item['right']}",
        "from_reaction_entity_id": item["left"],
        "to_reaction_entity_id": item["right"],
        "score": item["score"],
        "basis": item["basis"],
        "warnings": ["semantic_similarity_without_computed_fingerprint"],
    }


def fake_factory(case: dict[str, Any]):
    skipped = set(case.get("skipped_providers", []))

    def factory(provider_kind: str):
        if provider_kind in skipped:
            return lambda reactions: skip_result(provider_kind)
        edges = case.get("provider_edges", {}).get(provider_kind)
        if edges is None:
            return None
        return lambda reactions: pass_result(provider_kind, edges)

    return factory


def skip_result(provider_kind: str) -> dict[str, Any]:
    return {
        "provider": {
            "provider_id": provider_id(provider_kind),
            "kind": provider_kind,
            "status": "SKIP",
            "warnings": ["dependency_not_installed"],
        },
        "reaction_features": [],
        "similarity_edges": [],
        "warnings": ["dependency_not_installed"],
    }


def pass_result(provider_kind: str, edges: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "provider": {
            "provider_id": provider_id(provider_kind),
            "kind": provider_kind,
            "status": "PASS",
            "warnings": [],
        },
        "reaction_features": [],
        "similarity_edges": [computed_edge(provider_kind, item) for item in edges],
        "warnings": [],
    }


def computed_edge(provider_kind: str, item: dict[str, Any]) -> dict[str, Any]:
    return {
        "edge_id": f"computed-edge::{item['left']}::{item['right']}::{item['basis']}",
        "from_reaction_entity_id": item["left"],
        "to_reaction_entity_id": item["right"],
        "score": item["score"],
        "confidence": "medium",
        "basis": [item["basis"]],
        "provider_ids": [provider_id(provider_kind)],
        "source_hashes": [f"sha256:{item['left']}", f"sha256:{item['right']}"],
        "warnings": [],
    }


def collect_warnings(value: Any) -> set[str]:
    warnings: set[str] = set()
    if isinstance(value, dict):
        if isinstance(value.get("warnings"), list):
            warnings.update(item for item in value["warnings"] if isinstance(item, str))
        for item in value.values():
            warnings.update(collect_warnings(item))
    elif isinstance(value, list):
        for item in value:
            warnings.update(collect_warnings(item))
    return warnings


def provider_id(provider_kind: str) -> str:
    return {
        "rdkit_fingerprint": "provider::rdkit-fingerprint",
        "rxnmapper": "provider::rxnmapper",
        "rxnfp": "provider::rxnfp",
    }[provider_kind]


def fixed_clock() -> datetime:
    return datetime(2026, 5, 13, tzinfo=UTC)


if __name__ == "__main__":
    unittest.main()
