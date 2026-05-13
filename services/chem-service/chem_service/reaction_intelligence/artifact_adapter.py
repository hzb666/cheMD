from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from chem_service.reaction_intelligence.similarity import HybridSimilarityEdge, ProviderResult

ProviderResultsByReaction = dict[str, dict[str, ProviderResult]]


def normalize_provider_results(provider_results: Any | None) -> ProviderResultsByReaction:
    if provider_results is None:
        return {}
    if isinstance(provider_results, list):
        return _normalize_result_list(provider_results)
    if not isinstance(provider_results, Mapping):
        return {}
    if _looks_like_provider_artifact(provider_results):
        return _normalize_provider_artifact(provider_results)
    if all(isinstance(value, list) for value in provider_results.values()):
        return _normalize_result_mapping(provider_results)
    return _normalize_per_reaction_mapping(provider_results)


def computed_features_from_results(
    results_by_reaction: ProviderResultsByReaction,
) -> list[dict[str, Any]]:
    features: list[dict[str, Any]] = []
    for reaction_id, per_provider in results_by_reaction.items():
        for provider, result in per_provider.items():
            if result.get("status") != "ok":
                continue
            feature = _feature_from_result(reaction_id, provider, result)
            if feature is not None:
                features.append(feature)
    return features


def artifact_similarity_edge(edge: HybridSimilarityEdge) -> HybridSimilarityEdge:
    normalized = dict(edge)
    normalized["from_reaction_entity_id"] = normalized.pop("from_reaction_id")
    normalized["to_reaction_entity_id"] = normalized.pop("to_reaction_id")
    normalized["source"] = "computed_artifact"
    if normalized.get("computed_chemistry") and "hybrid_computed" not in normalized["basis"]:
        normalized["basis"] = ["hybrid_computed", *normalized["basis"]]
    return normalized


def _normalize_result_list(results: list[Any]) -> ProviderResultsByReaction:
    normalized: ProviderResultsByReaction = {}
    for result in results:
        if isinstance(result, Mapping) and isinstance(result.get("provider"), str):
            _put_provider_result(normalized, result["provider"], result)
    return normalized


def _normalize_result_mapping(provider_results: Mapping[str, Any]) -> ProviderResultsByReaction:
    normalized: ProviderResultsByReaction = {}
    for provider, results in provider_results.items():
        if not isinstance(provider, str) or not isinstance(results, list):
            continue
        for result in results:
            if isinstance(result, Mapping):
                _put_provider_result(normalized, provider, result)
    return normalized


def _normalize_per_reaction_mapping(
    provider_results: Mapping[str, Any],
) -> ProviderResultsByReaction:
    normalized: ProviderResultsByReaction = {}
    for reaction_id, per_provider in provider_results.items():
        if not isinstance(reaction_id, str) or not isinstance(per_provider, Mapping):
            continue
        normalized[reaction_id] = {}
        for provider, result in per_provider.items():
            if isinstance(provider, str) and isinstance(result, Mapping):
                normalized[reaction_id][_canonical_provider(provider)] = _normalize_provider_result(
                    _canonical_provider(provider),
                    result,
                )
    return normalized


def _put_provider_result(
    normalized: ProviderResultsByReaction,
    provider: str,
    result: Mapping[str, Any],
) -> None:
    reaction_id = result.get("reaction_id") or result.get("id")
    if not isinstance(reaction_id, str) or not reaction_id:
        return
    canonical_provider = _canonical_provider(provider)
    normalized.setdefault(reaction_id, {})[canonical_provider] = _normalize_provider_result(
        canonical_provider,
        result,
    )


def _looks_like_provider_artifact(provider_results: Mapping[str, Any]) -> bool:
    return any(key in provider_results for key in ("fingerprints", "atom_mappings"))


def _normalize_provider_artifact(provider_results: Mapping[str, Any]) -> ProviderResultsByReaction:
    normalized: ProviderResultsByReaction = {}
    for fingerprint in provider_results.get("fingerprints", []):
        if isinstance(fingerprint, Mapping):
            _put_provider_result(normalized, "rdkit_fingerprint", fingerprint)
    for mapping in provider_results.get("atom_mappings", []):
        if isinstance(mapping, Mapping):
            _put_reaction_center_result(normalized, mapping)
    return normalized


def _put_reaction_center_result(
    normalized: ProviderResultsByReaction,
    mapping: Mapping[str, Any],
) -> None:
    center = mapping.get("reaction_center")
    if isinstance(center, Mapping):
        _put_provider_result(normalized, "reaction_center", center | {
            "reaction_id": mapping.get("reaction_id"),
            "provider": "reaction_center",
        })


def _normalize_provider_result(provider: str, result: Mapping[str, Any]) -> ProviderResult:
    normalized = dict(result)
    status = normalized.get("status")
    if isinstance(status, str):
        normalized["status"] = status.lower()
    if provider == "drfp" and "fingerprint" not in normalized:
        _copy_on_bits_as_fingerprint(normalized)
    if provider == "rdkit_fingerprint" and "fingerprint" not in normalized:
        _copy_on_bits_as_fingerprint(normalized)
    if provider == "reaction_center" and "signature" not in normalized:
        center_signature = normalized.get("reaction_center_signature")
        if isinstance(center_signature, str):
            normalized["signature"] = center_signature
    return normalized


def _copy_on_bits_as_fingerprint(normalized: ProviderResult) -> None:
    on_bits = normalized.get("on_bits")
    if isinstance(on_bits, list):
        normalized["fingerprint"] = on_bits


def _canonical_provider(provider: str) -> str:
    if provider in {"fingerprint", "rdkit-fingerprint"}:
        return "rdkit_fingerprint"
    return provider


def _feature_from_result(
    reaction_id: str,
    provider: str,
    result: ProviderResult,
) -> dict[str, Any] | None:
    if provider == "drfp":
        return _drfp_feature(reaction_id, result)
    if provider == "rdkit_fingerprint":
        return _rdkit_feature(reaction_id, result)
    if provider == "rxnfp":
        return _rxnfp_feature(reaction_id, result)
    if provider == "reaction_center":
        return _reaction_center_feature(reaction_id, result)
    return None


def _base_feature(reaction_id: str, provider: str, feature_kind: str) -> dict[str, Any]:
    return {
        "feature_id": f"ri-feature::{reaction_id}::{provider}",
        "reaction_entity_id": reaction_id,
        "provider": provider,
        "feature_kind": feature_kind,
        "status": "AVAILABLE",
        "source": "computed_artifact",
    }


def _drfp_feature(reaction_id: str, result: ProviderResult) -> dict[str, Any]:
    return {
        **_base_feature(reaction_id, "drfp", "drfp_reaction_fingerprint"),
        "fingerprint_ref": result.get("fingerprint_ref"),
        "warnings": result.get("warnings", []),
        "metadata": {
            "on_bits": result.get("fingerprint", []),
            "dimension": result.get("dimension"),
        },
    }


def _rdkit_feature(reaction_id: str, result: ProviderResult) -> dict[str, Any]:
    return {
        **_base_feature(reaction_id, "rdkit_fingerprint", "rdkit_reaction_fingerprint"),
        "fingerprint_ref": result.get("fingerprint_ref"),
        "warnings": result.get("warnings", []),
        "metadata": {"on_bits": result.get("fingerprint", [])},
    }


def _rxnfp_feature(reaction_id: str, result: ProviderResult) -> dict[str, Any]:
    return {
        **_base_feature(reaction_id, "rxnfp", "rxnfp_embedding"),
        "vector_ref": result.get("vector_ref"),
        "embedding_dimension": result.get("dimension"),
        "warnings": result.get("warnings", []),
    }


def _reaction_center_feature(reaction_id: str, result: ProviderResult) -> dict[str, Any]:
    return {
        **_base_feature(reaction_id, "reaction_center", "reaction_center"),
        "reaction_center_signature": result.get("signature"),
        "warnings": result.get("warnings", []),
    }
