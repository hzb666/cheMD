from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any

from chem_cluster_service.intelligence.contracts import ComputedSimilarityEdge

SEMANTIC_ONLY_WARNING = "semantic_similarity_without_computed_fingerprint"
HYBRID_PROVIDER_ID = "provider::hybrid-graph"

COMPONENT_WEIGHTS = {
    "semantic": 0.20,
    "rdkit": 0.30,
    "rxnfp": 0.25,
    "reaction_center": 0.25,
}

COMPUTED_BASIS_ORDER = [
    "semantic_family_support",
    "semantic_procedure_support",
    "rdkit_fingerprint_tanimoto",
    "rxnfp_cosine",
    "same_reaction_center",
    "compatible_reaction_center",
    "conflicting_reaction_center",
    "hybrid_consensus",
]

SEMANTIC_BASIS_MAP = {
    "same_reaction_signature": ["semantic_family_support", "semantic_procedure_support"],
    "same_reaction_family": ["semantic_family_support"],
    "same_procedure_signature": ["semantic_procedure_support"],
    "same_family_procedure": ["semantic_family_support", "semantic_procedure_support"],
    "same_route": ["semantic_procedure_support"],
    "same_condition_signature": ["semantic_procedure_support"],
}

COMPUTED_BASIS_COMPONENTS = {
    "semantic_family_support": "semantic",
    "semantic_procedure_support": "semantic",
    "rdkit_fingerprint_tanimoto": "rdkit",
    "rxnfp_cosine": "rxnfp",
    "same_reaction_center": "reaction_center",
    "compatible_reaction_center": "reaction_center",
    "conflicting_reaction_center": "reaction_center",
}


@dataclass
class _PairAggregate:
    first: str
    second: str
    scores: dict[str, float] = field(default_factory=dict)
    basis: set[str] = field(default_factory=set)
    warnings: set[str] = field(default_factory=set)
    provider_ids: set[str] = field(default_factory=set)
    source_hashes: set[str] = field(default_factory=set)


def build_hybrid_similarity_edges(
    semantic_source: Any = None,
    computed_sources: Any = None,
    *,
    provider_id: str = HYBRID_PROVIDER_ID,
) -> list[ComputedSimilarityEdge]:
    aggregates: dict[tuple[str, str], _PairAggregate] = {}
    for edge in _iter_edges(semantic_source):
        _merge_edge(aggregates, edge, source_kind="semantic")
    for edge in _iter_edges(computed_sources):
        _merge_edge(aggregates, edge, source_kind="computed")
    return [
        _to_edge(item, provider_id)
        for item in sorted(aggregates.values(), key=lambda item: (item.first, item.second))
    ]


def _merge_edge(
    aggregates: dict[tuple[str, str], _PairAggregate],
    edge: Mapping[str, Any],
    *,
    source_kind: str,
) -> None:
    pair = _pair(edge)
    score = _score(edge.get("score"))
    if pair is None or score is None:
        return

    basis, components, warnings = _edge_basis_components(edge, source_kind)
    if not components:
        return

    aggregate = aggregates.setdefault(pair, _PairAggregate(pair[0], pair[1]))
    aggregate.basis.update(basis)
    aggregate.warnings.update(warnings)
    aggregate.provider_ids.update(_strings(edge.get("provider_ids")))
    aggregate.provider_ids.update(_strings([edge.get("provider_id")]))
    aggregate.source_hashes.update(_strings(edge.get("source_hashes")))
    aggregate.warnings.update(_strings(edge.get("warnings")))
    for component in components:
        aggregate.scores[component] = max(score, aggregate.scores.get(component, 0.0))


def _edge_basis_components(
    edge: Mapping[str, Any], source_kind: str
) -> tuple[set[str], set[str], set[str]]:
    basis: set[str] = set()
    components: set[str] = set()
    warnings: set[str] = set()
    for item in _strings(edge.get("basis")):
        if source_kind == "semantic":
            mapped = SEMANTIC_BASIS_MAP.get(item)
            if mapped is None and item in COMPUTED_BASIS_COMPONENTS:
                mapped = [item]
            if mapped is None:
                warnings.add(f"semantic_similarity_basis_unmapped:{item}")
                continue
            basis.update(mapped)
            components.add("semantic")
            continue
        if item in COMPUTED_BASIS_COMPONENTS:
            basis.add(item)
            components.add(COMPUTED_BASIS_COMPONENTS[item])
    return basis, components, warnings


def _to_edge(aggregate: _PairAggregate, provider_id: str) -> ComputedSimilarityEdge:
    computed_components = {"rdkit", "rxnfp", "reaction_center"} & set(aggregate.scores)
    warnings = set(aggregate.warnings)
    if computed_components:
        warnings.discard(SEMANTIC_ONLY_WARNING)
    elif "semantic" in aggregate.scores:
        warnings.add(SEMANTIC_ONLY_WARNING)
    if _is_hard_reject(aggregate):
        warnings.add("strict_cluster_hard_reject:reaction_center_conflict_low_rdkit")

    basis = set(aggregate.basis)
    if len(aggregate.scores) > 1:
        basis.add("hybrid_consensus")
    provider_ids = set(aggregate.provider_ids)
    if len(aggregate.scores) > 1:
        provider_ids.add(provider_id)

    score = _weighted_score(aggregate.scores)
    sorted_warnings = sorted(warnings)
    return {
        "edge_id": f"computed-edge::{aggregate.first}::{aggregate.second}::hybrid-similarity",
        "from_reaction_entity_id": aggregate.first,
        "to_reaction_entity_id": aggregate.second,
        "score": score,
        "confidence": _confidence(score, bool(computed_components), sorted_warnings),
        "basis": _ordered_basis(basis),
        "provider_ids": sorted(provider_ids),
        "source_hashes": sorted(aggregate.source_hashes),
        "contributions": _contributions(aggregate),
        "warnings": sorted_warnings,
    }


def _weighted_score(scores: Mapping[str, float]) -> float:
    weight_total = sum(COMPONENT_WEIGHTS[item] for item in scores if item in COMPONENT_WEIGHTS)
    if weight_total == 0:
        return 0.0
    weighted = sum(
        scores[item] * COMPONENT_WEIGHTS[item] for item in scores if item in COMPONENT_WEIGHTS
    )
    return round(weighted / weight_total, 6)


def _is_hard_reject(aggregate: _PairAggregate) -> bool:
    return (
        "conflicting_reaction_center" in aggregate.basis
        and "rdkit" in aggregate.scores
        and aggregate.scores["rdkit"] < 0.45
    )


def _contributions(aggregate: _PairAggregate) -> list[dict[str, object]]:
    return [
        {
            "component": component,
            "score": round(aggregate.scores[component], 6),
            "weight": COMPONENT_WEIGHTS[component],
            "basis": _ordered_basis(
                {
                    basis
                    for basis in aggregate.basis
                    if COMPUTED_BASIS_COMPONENTS.get(basis) == component
                }
            ),
        }
        for component in ("semantic", "rdkit", "rxnfp", "reaction_center")
        if component in aggregate.scores and component in COMPONENT_WEIGHTS
    ]


def _confidence(score: float, has_computed_support: bool, warnings: list[str]) -> str:
    if not has_computed_support:
        return "low"
    if warnings:
        return "medium" if score >= 0.65 else "low"
    if score >= 0.85:
        return "high"
    if score >= 0.65:
        return "medium"
    return "low"


def _iter_edges(source: Any) -> Iterable[Mapping[str, Any]]:
    if source is None or isinstance(source, (str, bytes)):
        return
    if isinstance(source, Mapping):
        for key in ("reaction_similarity_edges", "similarity_edges", "explicit_edges"):
            yield from _iter_edges(source.get(key))
        if _pair(source) is not None:
            yield source
        return
    similarity_edges = getattr(source, "similarity_edges", None)
    if similarity_edges is not None:
        yield from _iter_edges(similarity_edges)
        return
    if isinstance(source, Iterable):
        for item in source:
            yield from _iter_edges(item)


def _pair(edge: Mapping[str, Any]) -> tuple[str, str] | None:
    left = edge.get("from_reaction_entity_id")
    right = edge.get("to_reaction_entity_id")
    if not isinstance(left, str) or not isinstance(right, str):
        return None
    if not left or not right or left == right:
        return None
    first, second = sorted((left, right))
    return first, second


def _score(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return max(0.0, min(1.0, float(value)))


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _ordered_basis(values: set[str]) -> list[str]:
    known = [item for item in COMPUTED_BASIS_ORDER if item in values]
    unknown = sorted(item for item in values if item not in COMPUTED_BASIS_ORDER)
    return known + unknown
