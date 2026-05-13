from __future__ import annotations

import hashlib
import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

ProviderResult = dict[str, Any]
SimilarityContribution = dict[str, Any]
HybridSimilarityEdge = dict[str, Any]


@dataclass(frozen=True, slots=True)
class HybridSimilarityWeights:
    semantic: float = 0.35
    fingerprint: float = 0.25
    rxnfp: float = 0.30
    reaction_center: float = 0.10

    def weight_for(self, provider: str) -> float:
        return float(getattr(self, provider, 0.0))


def cosine_score(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right) or not left:
        return 0.0

    dot = sum(float(a) * float(b) for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(float(value) * float(value) for value in left))
    right_norm = math.sqrt(sum(float(value) * float(value) for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return _clamp_score(dot / (left_norm * right_norm))


def tanimoto_like_score(left: Any, right: Any) -> float:
    left_set = _coerce_fingerprint_set(left)
    right_set = _coerce_fingerprint_set(right)
    if left_set is not None and right_set is not None:
        union = left_set | right_set
        if not union:
            return 0.0
        return len(left_set & right_set) / len(union)

    left_vector = _coerce_numeric_vector(left)
    right_vector = _coerce_numeric_vector(right)
    if len(left_vector) != len(right_vector) or not left_vector:
        return 0.0

    dot = sum(a * b for a, b in zip(left_vector, right_vector, strict=True))
    denominator = (
        sum(value * value for value in left_vector)
        + sum(value * value for value in right_vector)
        - dot
    )
    if denominator <= 0:
        return 0.0
    return _clamp_score(dot / denominator)


def reaction_center_score(left: str | None, right: str | None) -> float:
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0

    left_parts = {part for part in left.replace(">", ".").split(".") if part}
    right_parts = {part for part in right.replace(">", ".").split(".") if part}
    union = left_parts | right_parts
    if not union:
        return 0.0
    return len(left_parts & right_parts) / len(union)


def build_hybrid_similarity_edge(
    *,
    left_reaction_id: str,
    right_reaction_id: str,
    left_results: Mapping[str, ProviderResult] | None = None,
    right_results: Mapping[str, ProviderResult] | None = None,
    semantic_score: float | None = None,
    weights: HybridSimilarityWeights | None = None,
    expected_providers: Iterable[str] = ("fingerprint", "rxnfp", "reaction_center"),
) -> HybridSimilarityEdge:
    active_weights = weights or HybridSimilarityWeights()
    left = left_results or {}
    right = right_results or {}
    contributions: list[SimilarityContribution] = []
    warnings: list[str] = []

    if semantic_score is not None:
        score = _clamp_score(semantic_score)
        contributions.append(
            {
                "provider": "semantic",
                "basis": "semantic_similarity",
                "status": "ok",
                "score": score,
                "weight": active_weights.semantic,
                "weighted_score": score * active_weights.semantic,
                "warnings": [],
            }
        )

    for provider in expected_providers:
        contribution = _provider_contribution(
            provider=provider,
            left=left.get(provider),
            right=right.get(provider),
            weight=active_weights.weight_for(provider),
        )
        contributions.append(contribution)
        warnings.extend(contribution.get("warnings", []))

    available = [
        item for item in contributions if item["status"] == "ok" and item.get("score") is not None
    ]
    total_weight = sum(float(contribution["weight"]) for contribution in available)
    score = (
        sum(float(contribution["weighted_score"]) for contribution in available) / total_weight
        if total_weight > 0
        else 0.0
    )
    computed_chemistry = any(
        contribution["provider"] != "semantic" and contribution["status"] == "ok"
        for contribution in contributions
    )
    if not computed_chemistry and semantic_score is not None:
        warnings.append("semantic_only_similarity_not_computed_chemistry")

    return {
        "edge_id": _edge_id(left_reaction_id, right_reaction_id),
        "from_reaction_id": left_reaction_id,
        "to_reaction_id": right_reaction_id,
        "basis": [
            contribution["basis"]
            for contribution in contributions
            if contribution["status"] == "ok" and contribution.get("score") is not None
        ],
        "score": round(_clamp_score(score), 6),
        "computed_chemistry": computed_chemistry,
        "contributions": contributions,
        "warnings": _unique_strings(warnings),
    }


def _provider_contribution(
    *,
    provider: str,
    left: ProviderResult | None,
    right: ProviderResult | None,
    weight: float,
) -> SimilarityContribution:
    if left is None or right is None:
        return _skipped_contribution(
            provider,
            weight,
            f"{provider}_provider_skipped",
        )
    if left.get("status") != "ok" or right.get("status") != "ok":
        return _skipped_contribution(
            provider,
            weight,
            f"{provider}_provider_skipped",
            warnings=_result_warnings(left, right),
        )

    if provider == "fingerprint":
        score = tanimoto_like_score(left.get("fingerprint"), right.get("fingerprint"))
        return _ok_contribution(provider, "fingerprint_tanimoto", score, weight)
    if provider == "rxnfp":
        left_vector = _read_embedding(left)
        right_vector = _read_embedding(right)
        score = cosine_score(left_vector, right_vector)
        return _ok_contribution(provider, "rxnfp_cosine", score, weight)
    if provider == "reaction_center":
        score = reaction_center_score(_read_center_signature(left), _read_center_signature(right))
        return _ok_contribution(provider, "reaction_center_overlap", score, weight)

    return _skipped_contribution(provider, weight, f"{provider}_provider_not_supported")


def _ok_contribution(
    provider: str,
    basis: str,
    score: float,
    weight: float,
) -> SimilarityContribution:
    clamped = _clamp_score(score)
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
        "warnings": _unique_strings([warning, *(warnings or [])]),
    }


def _coerce_fingerprint_set(value: Any) -> set[str] | None:
    if value is None:
        return set()
    if isinstance(value, str):
        return {token for token in value.split() if token}
    if not isinstance(value, Sequence):
        return None
    if all(isinstance(item, int) and item in {0, 1} for item in value):
        return {str(index) for index, bit in enumerate(value) if bit}
    return None


def _coerce_numeric_vector(value: Any) -> list[float]:
    if not isinstance(value, Sequence) or isinstance(value, str):
        return []
    vector: list[float] = []
    for item in value:
        if not isinstance(item, int | float):
            return []
        vector.append(float(item))
    return vector


def _read_embedding(result: ProviderResult) -> list[float]:
    return _coerce_numeric_vector(result.get("embedding") or result.get("vector"))


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


def _clamp_score(value: float) -> float:
    if math.isnan(value) or math.isinf(value):
        return 0.0
    return max(0.0, min(1.0, float(value)))


def _unique_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    return unique
