from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from chem_service.reaction_intelligence.similarity_metrics import (
    clamp_score,
    coerce_numeric_vector,
    cosine_score,
    reaction_center_score,
    tanimoto_like_score,
    unique_strings,
)

ProviderResult = dict[str, Any]
SimilarityContribution = dict[str, Any]
HybridSimilarityEdge = dict[str, Any]


@dataclass(frozen=True, slots=True)
class HybridSimilarityWeights:
    semantic: float = 0.25
    fingerprint: float = 0.30
    rxnfp: float = 0.25
    reaction_center: float = 0.20

    def weight_for(self, provider: str) -> float:
        if provider in {"drfp", "rdkit_fingerprint"}:
            return self.fingerprint
        return float(getattr(self, provider, 0.0))


def build_hybrid_similarity_edge(
    *,
    left_reaction_id: str,
    right_reaction_id: str,
    left_results: Mapping[str, ProviderResult] | None = None,
    right_results: Mapping[str, ProviderResult] | None = None,
    semantic_score: float | None = None,
    weights: HybridSimilarityWeights | None = None,
    expected_providers: Iterable[str] = ("drfp", "rdkit_fingerprint", "rxnfp", "reaction_center"),
) -> HybridSimilarityEdge:
    active_weights = weights or HybridSimilarityWeights()
    left = left_results or {}
    right = right_results or {}
    contributions = _semantic_contributions(semantic_score, active_weights)
    warnings: list[str] = []

    for provider in _select_similarity_providers(expected_providers, left, right):
        contribution = _provider_contribution(
            provider=provider,
            left=_provider_result(left, provider),
            right=_provider_result(right, provider),
            weight=active_weights.weight_for(provider),
        )
        contributions.append(contribution)
        warnings.extend(contribution.get("warnings", []))

    score = _weighted_score(contributions)
    computed_chemistry = _has_computed_chemistry(contributions)
    if not computed_chemistry and semantic_score is not None:
        warnings.append("semantic_only_similarity_not_computed_chemistry")

    return {
        "edge_id": _edge_id(left_reaction_id, right_reaction_id),
        "from_reaction_id": left_reaction_id,
        "to_reaction_id": right_reaction_id,
        "basis": _basis(contributions),
        "score": round(clamp_score(score), 6),
        "computed_chemistry": computed_chemistry,
        "contributions": contributions,
        "warnings": unique_strings(warnings),
    }


def _semantic_contributions(
    semantic_score: float | None,
    weights: HybridSimilarityWeights,
) -> list[SimilarityContribution]:
    if semantic_score is None:
        return []
    score = clamp_score(semantic_score)
    return [_ok_contribution("semantic", "semantic_similarity", score, weights.semantic)]


def _select_similarity_providers(
    providers: Iterable[str],
    left: Mapping[str, ProviderResult],
    right: Mapping[str, ProviderResult],
) -> list[str]:
    requested = list(providers)
    if "drfp" in requested and _has_ok_result(left, right, "drfp"):
        return [provider for provider in requested if provider != "rdkit_fingerprint"]
    return requested


def _provider_contribution(
    *,
    provider: str,
    left: ProviderResult | None,
    right: ProviderResult | None,
    weight: float,
) -> SimilarityContribution:
    if left is None or right is None:
        return _skipped_contribution(provider, weight, f"{provider}_provider_skipped")
    if left.get("status") != "ok" or right.get("status") != "ok":
        return _skipped_contribution(
            provider,
            weight,
            f"{provider}_provider_skipped",
            warnings=_result_warnings(left, right),
        )
    return _ok_provider_contribution(provider, left, right, weight)


def _ok_provider_contribution(
    provider: str,
    left: ProviderResult,
    right: ProviderResult,
    weight: float,
) -> SimilarityContribution:
    if provider == "drfp":
        score = tanimoto_like_score(left.get("fingerprint"), right.get("fingerprint"))
        return _ok_contribution("drfp", "drfp_tanimoto", score, weight)
    if provider in {"fingerprint", "rdkit_fingerprint"}:
        score = tanimoto_like_score(left.get("fingerprint"), right.get("fingerprint"))
        return _ok_contribution("rdkit_fingerprint", "rdkit_tanimoto", score, weight)
    if provider == "rxnfp":
        score = cosine_score(_read_embedding(left), _read_embedding(right))
        return _ok_contribution(provider, "rxnfp_cosine", score, weight)
    if provider == "reaction_center":
        score = reaction_center_score(_read_center_signature(left), _read_center_signature(right))
        return _ok_contribution(provider, "atom_mapping_reaction_center", score, weight)
    return _skipped_contribution(provider, weight, f"{provider}_provider_not_supported")


def _provider_result(
    results: Mapping[str, ProviderResult],
    provider: str,
) -> ProviderResult | None:
    if provider in results:
        return results[provider]
    if provider == "rdkit_fingerprint":
        return results.get("fingerprint")
    return None


def _has_ok_result(
    left: Mapping[str, ProviderResult],
    right: Mapping[str, ProviderResult],
    provider: str,
) -> bool:
    left_result = _provider_result(left, provider)
    right_result = _provider_result(right, provider)
    return (
        left_result is not None
        and right_result is not None
        and left_result.get("status") == "ok"
        and right_result.get("status") == "ok"
    )


def _ok_contribution(
    provider: str,
    basis: str,
    score: float,
    weight: float,
) -> SimilarityContribution:
    clamped = clamp_score(score)
    return {
        "provider": provider,
        "basis": basis,
        "status": "ok",
        "score": clamped,
        "weight": weight,
        "weighted_score": clamped * weight,
        "warnings": [],
    }


def _skipped_contribution(
    provider: str,
    weight: float,
    warning: str,
    *,
    warnings: list[str] | None = None,
) -> SimilarityContribution:
    return {
        "provider": provider,
        "basis": provider,
        "status": "skipped",
        "score": None,
        "weight": weight,
        "weighted_score": 0.0,
        "warnings": unique_strings([warning, *(warnings or [])]),
    }


def _weighted_score(contributions: list[SimilarityContribution]) -> float:
    available = [
        item for item in contributions if item["status"] == "ok" and item.get("score") is not None
    ]
    total_weight = sum(float(contribution["weight"]) for contribution in available)
    if total_weight <= 0:
        return 0.0
    return sum(float(contribution["weighted_score"]) for contribution in available) / total_weight


def _has_computed_chemistry(contributions: list[SimilarityContribution]) -> bool:
    return any(
        contribution["provider"] != "semantic" and contribution["status"] == "ok"
        for contribution in contributions
    )


def _basis(contributions: list[SimilarityContribution]) -> list[str]:
    return [
        contribution["basis"]
        for contribution in contributions
        if contribution["status"] == "ok" and contribution.get("score") is not None
    ]


def _read_embedding(result: ProviderResult) -> list[float]:
    return coerce_numeric_vector(result.get("embedding") or result.get("vector"))


def _read_center_signature(result: ProviderResult) -> str | None:
    signature = result.get("reaction_center_signature") or result.get("signature")
    return signature if isinstance(signature, str) else None


def _result_warnings(left: ProviderResult, right: ProviderResult) -> list[str]:
    warnings: list[str] = []
    for result in (left, right):
        value = result.get("warnings")
        if isinstance(value, list):
            warnings.extend(item for item in value if isinstance(item, str))
    return warnings


def _edge_id(left_reaction_id: str, right_reaction_id: str) -> str:
    pair = "::".join(sorted([left_reaction_id, right_reaction_id]))
    digest = hashlib.sha256(pair.encode("utf-8")).hexdigest()[:16]
    return f"reaction-similarity::{digest}"
