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


def read_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


class ReactionIntelligencePipelineTests(unittest.TestCase):
    def test_invalid_input_returns_validation_envelope(self):
        payload = read_fixture("reaction_intelligence_job.invalid.json")

        result = run_reaction_intelligence_pipeline(payload)

        self.assertEqual(result.exit_code, 1)
        self.assertEqual(result.payload["status"], "ERROR")
        self.assertEqual(result.payload["code"], "invalid_input")
        self.assertIn("reactions[0].source_hash is required", result.payload["errors"])

    def test_skip_policy_keeps_missing_provider_as_skip(self):
        payload = job_for(["rdkit_fingerprint"])

        result = run_reaction_intelligence_pipeline(
            payload,
            provider_factory=fake_factory({"rdkit_fingerprint": skip_result("rdkit_fingerprint")}),
            clock=fixed_clock,
        )

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(validate_artifact(result.payload), [])
        self.assertEqual(result.payload["providers"][0]["status"], "SKIP")
        self.assertEqual(result.payload["generated_at"], "2026-05-13T00:00:00.000Z")

    def test_error_policy_promotes_missing_provider_to_error(self):
        payload = job_for(["rxnfp"], missing_dependency="error")

        result = run_reaction_intelligence_pipeline(
            payload,
            provider_factory=fake_factory({"rxnfp": skip_result("rxnfp")}),
            clock=fixed_clock,
        )

        self.assertEqual(result.exit_code, 2)
        self.assertEqual(result.payload["providers"][0]["status"], "ERROR")
        self.assertIn("missing_dependency_policy_error", result.payload["providers"][0]["warnings"])
        self.assertEqual(validate_artifact(result.payload), [])

    def test_hybrid_provider_merges_semantic_and_computed_edges(self):
        payload = job_for(["rdkit_fingerprint", "hybrid_graph"])
        payload["reaction_similarity_edges"] = [
            {
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.9,
                "basis": ["same_reaction_family"],
                "warnings": [],
            },
        ]

        result = run_reaction_intelligence_pipeline(
            payload,
            provider_factory=fake_factory({"rdkit_fingerprint": pass_result("rdkit_fingerprint")}),
            clock=fixed_clock,
        )

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(
            [item["kind"] for item in result.payload["providers"]],
            ["rdkit_fingerprint", "hybrid_graph"],
        )
        self.assertEqual(len(result.payload["reaction_features"]), 2)
        self.assertEqual(
            result.payload["similarity_edges"][-1]["basis"],
            [
                "semantic_family_support",
                "rdkit_fingerprint_tanimoto",
                "hybrid_consensus",
            ],
        )
        self.assertEqual(validate_artifact(result.payload), [])

    def test_tmap_layout_is_classified_without_dependency(self):
        payload = job_for(["tmap_layout"], missing_dependency="fallback")

        result = run_reaction_intelligence_pipeline(payload, clock=fixed_clock)

        self.assertEqual(result.exit_code, 0)
        self.assertEqual(result.payload["providers"][0]["status"], "SKIP")
        self.assertEqual(result.payload["layout"]["layout_engine"], "deterministic-fallback")
        self.assertIn("dependency_not_installed", result.payload["providers"][0]["warnings"])
        self.assertIn("deterministic_fallback_layout_used", result.payload["layout"]["warnings"])


def job_for(providers: list[str], *, missing_dependency: str = "skip") -> dict[str, Any]:
    return {
        "schema_version": "chemd-reaction-intelligence-job/v0.1",
        "job_id": "reaction-intelligence-job::unit",
        "graph_index_id": "graph-index::unit",
        "source_compile_run_ids": ["compile-run::unit"],
        "reactions": [
            reaction("rxn-a", "sha256:a"),
            reaction("rxn-b", "sha256:b"),
        ],
        "requested_providers": providers,
        "provider_policy": {
            "missing_dependency": missing_dependency,
            "per_reaction_failure": "warn",
            "allow_network": False,
        },
    }


def reaction(reaction_id: str, source_hash: str) -> dict[str, str]:
    return {
        "reaction_entity_id": reaction_id,
        "document_id": "doc-unit",
        "canonical_rxn_smiles": "CCO>>CC=O",
        "participant_signature": reaction_id,
        "source_hash": source_hash,
    }


def fake_factory(outputs: dict[str, Any]):
    def factory(provider_kind):
        output = outputs.get(provider_kind)
        if output is None:
            return None
        return lambda reactions: output

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


def pass_result(provider_kind: str) -> dict[str, Any]:
    return {
        "provider": {
            "provider_id": provider_id(provider_kind),
            "kind": provider_kind,
            "status": "PASS",
            "warnings": [],
        },
        "reaction_features": [
            feature("rxn-a", "sha256:a"),
            feature("rxn-b", "sha256:b"),
        ],
        "similarity_edges": [
            {
                "edge_id": "computed-edge::rxn-a::rxn-b::rdkit",
                "from_reaction_entity_id": "rxn-a",
                "to_reaction_entity_id": "rxn-b",
                "score": 0.8,
                "confidence": "medium",
                "basis": ["rdkit_fingerprint_tanimoto"],
                "provider_ids": [provider_id(provider_kind)],
                "source_hashes": ["sha256:a", "sha256:b"],
                "warnings": [],
            },
        ],
        "warnings": [],
    }


def feature(reaction_id: str, source_hash: str) -> dict[str, Any]:
    return {
        "reaction_entity_id": reaction_id,
        "source_hash": source_hash,
        "canonical_rxn_smiles": "CCO>>CC=O",
        "fingerprint_refs": [
            {
                "feature_ref_id": f"feature-ref::{reaction_id}",
                "provider": "rdkit",
                "kind": "bit_vector",
                "dimension": 2048,
                "storage": "inline",
                "hash": f"sha256:fp-{reaction_id}",
            },
        ],
        "warnings": [],
    }


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
