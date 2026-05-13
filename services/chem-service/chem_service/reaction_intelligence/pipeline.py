from __future__ import annotations

from collections.abc import Iterable, Mapping
from itertools import combinations
from typing import Any, TypedDict

from chem_service.reaction_intelligence.similarity import (
    HybridSimilarityEdge,
    HybridSimilarityWeights,
    ProviderResult,
    build_hybrid_similarity_edge,
)


class ReactionInput(TypedDict, total=False):
    reaction_id: str
    id: str
    rxn_smiles: str
    reaction_smiles: str
    semantic_similarity: dict[str, float]


class ReactionIntelligenceArtifact(TypedDict):
    schema_version: str
    reactions: list[dict[str, Any]]
    providers: list[dict[str, Any]]
    similarity_edges: list[HybridSimilarityEdge]
    warnings: list[str]


ProviderResultsByReaction = dict[str, dict[str, ProviderResult]]


def build_reaction_intelligence_artifact(
    *,
    reactions: Iterable[ReactionInput],
    provider_results: Any | None = None,
    semantic_edges: Iterable[Mapping[str, Any]] | None = None,
    weights: HybridSimilarityWeights | None = None,
    expected_providers: Iterable[str] = ("fingerprint", "rxnfp", "reaction_center"),
) -> ReactionIntelligenceArtifact:
    materialized = list(reactions)
    provider_names = list(expected_providers)
    results_by_reaction = normalize_provider_results(provider_results)
    semantic_scores = _normalize_semantic_edges(semantic_edges)
    provider_statuses = _build_provider_statuses(provider_names, results_by_reaction)
    artifact_warnings = _collect_provider_warnings(provider_statuses)

    edges: list[HybridSimilarityEdge] = []
    for left, right in combinations(materialized, 2):
        left_id = _read_reaction_id(left)
        right_id = _read_reaction_id(right)
        edge = build_hybrid_similarity_edge(
            left_reaction_id=left_id,
            right_reaction_id=right_id,
            left_results=results_by_reaction.get(left_id, {}),
            right_results=results_by_reaction.get(right_id, {}),
            semantic_score=_lookup_semantic_score(left, right, semantic_scores),
            weights=weights,
            expected_providers=provider_names,
        )
        if edge["basis"] or edge["warnings"]:
            edges.append(edge)

    for edge in edges:
        artifact_warnings.extend(edge["warnings"])

    return {
        "schema_version": "chemd-reaction-intelligence-artifact/v0.1",
        "reactions": [dict(reaction) for reaction in materialized],
        "providers": provider_statuses,
        "similarity_edges": edges,
        "warnings": _unique_strings(artifact_warnings),
    }


def normalize_provider_results(provider_results: Any | None) -> ProviderResultsByReaction:
    if provider_results is None:
        return {}

    if isinstance(provider_results, list):
        return _normalize_result_list(provider_results)

    if not isinstance(provider_results, Mapping):
        return {}

    if all(isinstance(value, list) for value in provider_results.values()):
        normalized: ProviderResultsByReaction = {}
        for provider, results in provider_results.items():
            if not isinstance(provider, str) or not isinstance(results, list):
                continue
            for result in results:
                if isinstance(result, Mapping):
                    _put_provider_result(normalized, provider, result)
        return normalized

    normalized = {}
    for reaction_id, per_provider in provider_results.items():
        if not isinstance(reaction_id, str) or not isinstance(per_provider, Mapping):
            continue
        normalized[reaction_id] = {}
        for provider, result in per_provider.items():
            if isinstance(provider, str) and isinstance(result, Mapping):
                normalized[reaction_id][provider] = dict(result)
    return normalized


def _normalize_result_list(results: list[Any]) -> ProviderResultsByReaction:
    normalized: ProviderResultsByReaction = {}
    for result in results:
        if not isinstance(result, Mapping):
            continue
        provider = result.get("provider")
        if isinstance(provider, str):
            _put_provider_result(normalized, provider, result)
    return normalized


def _put_provider_result(
    normalized: ProviderResultsByReaction,
    provider: str,
    result: Mapping[str, Any],
) -> None:
    reaction_id = result.get("reaction_id") or result.get("id")
    if not isinstance(reaction_id, str) or not reaction_id:
        return
    normalized.setdefault(reaction_id, {})[provider] = dict(result)


def _build_provider_statuses(
    provider_names: list[str],
    results_by_reaction: ProviderResultsByReaction,
) -> list[dict[str, Any]]:
    statuses: list[dict[str, Any]] = []
    for provider in provider_names:
        results = [
            per_provider[provider]
            for per_provider in results_by_reaction.values()
            if provider in per_provider
        ]
        if not results:
            statuses.append(
                {
                    "provider": provider,
                    "status": "skipped",
                    "warnings": [f"{provider}_provider_skipped"],
                }
            )
            continue

        has_ok = any(result.get("status") == "ok" for result in results)
        warnings: list[str] = []
        for result in results:
            value = result.get("warnings")
            if isinstance(value, list):
                warnings.extend(item for item in value if isinstance(item, str))
        statuses.append(
            {
                "provider": provider,
                "status": "ok" if has_ok else "skipped",
                "warnings": _unique_strings(warnings),
            }
        )
    return statuses


def _collect_provider_warnings(provider_statuses: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    for status in provider_statuses:
        value = status.get("warnings")
        if isinstance(value, list):
            warnings.extend(item for item in value if isinstance(item, str))
    return warnings


def _normalize_semantic_edges(
    semantic_edges: Iterable[Mapping[str, Any]] | None,
) -> dict[tuple[str, str], float]:
    scores: dict[tuple[str, str], float] = {}
    for edge in semantic_edges or []:
        left = edge.get("from_reaction_id") or edge.get("source")
        right = edge.get("to_reaction_id") or edge.get("target")
        score = edge.get("score")
        if isinstance(left, str) and isinstance(right, str) and isinstance(score, int | float):
            scores[_pair_key(left, right)] = float(score)
    return scores


def _lookup_semantic_score(
    left: ReactionInput,
    right: ReactionInput,
    semantic_scores: dict[tuple[str, str], float],
) -> float | None:
    left_id = _read_reaction_id(left)
    right_id = _read_reaction_id(right)
    if _pair_key(left_id, right_id) in semantic_scores:
        return semantic_scores[_pair_key(left_id, right_id)]

    left_scores = left.get("semantic_similarity")
    if isinstance(left_scores, dict):
        value = left_scores.get(right_id)
        if isinstance(value, int | float):
            return float(value)
    return None


def _read_reaction_id(reaction: ReactionInput) -> str:
    reaction_id = reaction.get("reaction_id") or reaction.get("id")
    if not isinstance(reaction_id, str) or not reaction_id.strip():
        raise ValueError("reaction_id is required")
    return reaction_id.strip()


def _pair_key(left: str, right: str) -> tuple[str, str]:
    ordered = sorted([left, right])
    return (ordered[0], ordered[1])


def _unique_strings(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    return unique
