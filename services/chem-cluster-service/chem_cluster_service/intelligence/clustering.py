from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping
from typing import Any

COMPUTED_BASIS = {
    "rdkit_fingerprint_tanimoto",
    "rxnfp_cosine",
    "same_reaction_center",
    "compatible_reaction_center",
    "conflicting_reaction_center",
    "hybrid_consensus",
}
SEMANTIC_BASIS = {
    "semantic_family_support",
    "semantic_procedure_support",
}
HARD_REJECT_WARNING = "strict_cluster_hard_reject:reaction_center_conflict_low_rdkit"
STRICT_THRESHOLD = 0.75
CANDIDATE_THRESHOLD = 0.55
SEMANTIC_THRESHOLD = 0.65


def build_reaction_similarity_groups(
    reaction_ids: list[str],
    similarity_edges: list[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    ids = sorted(dict.fromkeys(item for item in reaction_ids if isinstance(item, str) and item))
    strict_edges: list[dict[str, Any]] = []
    candidate_edges: list[dict[str, Any]] = []
    semantic_edges: list[dict[str, Any]] = []

    for edge in similarity_edges:
        normalized = _edge(edge, ids)
        if normalized is None:
            continue
        if _is_strict_edge(normalized):
            strict_edges.append(normalized)
        elif _is_candidate_edge(normalized):
            candidate_edges.append(_candidate_payload(normalized))
        elif _is_semantic_edge(normalized):
            semantic_edges.append(normalized)

    return {
        "strict_reaction_clusters": _strict_clusters(ids, strict_edges),
        "candidate_reaction_neighbors": sorted(
            candidate_edges, key=lambda item: (item["from_reaction_entity_id"], item["to_reaction_entity_id"])
        ),
        "semantic_reaction_groups": _semantic_groups(ids, semantic_edges),
    }


def _edge(edge: Mapping[str, Any], reaction_ids: list[str]) -> dict[str, Any] | None:
    left = edge.get("from_reaction_entity_id")
    right = edge.get("to_reaction_entity_id")
    score = edge.get("score")
    if not isinstance(left, str) or not isinstance(right, str) or left == right:
        return None
    if left not in reaction_ids or right not in reaction_ids:
        return None
    if isinstance(score, bool) or not isinstance(score, (int, float)):
        return None
    first, second = sorted((left, right))
    return {
        "edge_id": str(edge.get("edge_id") or f"edge::{first}::{second}"),
        "from_reaction_entity_id": first,
        "to_reaction_entity_id": second,
        "score": max(0.0, min(1.0, float(score))),
        "basis": _strings(edge.get("basis")),
        "warnings": _strings(edge.get("warnings")),
    }


def _is_strict_edge(edge: Mapping[str, Any]) -> bool:
    basis = set(_strings(edge.get("basis")))
    warnings = set(_strings(edge.get("warnings")))
    return (
        edge["score"] >= STRICT_THRESHOLD
        and bool(basis & COMPUTED_BASIS)
        and HARD_REJECT_WARNING not in warnings
        and basis != {"hybrid_consensus"}
        and not basis <= SEMANTIC_BASIS
    )


def _is_candidate_edge(edge: Mapping[str, Any]) -> bool:
    basis = set(_strings(edge.get("basis")))
    return edge["score"] >= CANDIDATE_THRESHOLD and bool(basis & COMPUTED_BASIS)


def _is_semantic_edge(edge: Mapping[str, Any]) -> bool:
    basis = set(_strings(edge.get("basis")))
    return edge["score"] >= SEMANTIC_THRESHOLD and bool(basis) and basis <= SEMANTIC_BASIS


def _candidate_payload(edge: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "edge_id": edge["edge_id"],
        "from_reaction_entity_id": edge["from_reaction_entity_id"],
        "to_reaction_entity_id": edge["to_reaction_entity_id"],
        "score": round(float(edge["score"]), 6),
        "basis": _strings(edge.get("basis")),
        "warnings": _strings(edge.get("warnings")),
    }


def _strict_clusters(reaction_ids: list[str], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    adjacency: dict[str, set[str]] = {reaction_id: set() for reaction_id in reaction_ids}
    edges_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for edge in edges:
        left = edge["from_reaction_entity_id"]
        right = edge["to_reaction_entity_id"]
        adjacency[left].add(right)
        adjacency[right].add(left)
        edges_by_pair[(left, right)] = edge

    clusters: list[dict[str, Any]] = []
    seen: set[str] = set()
    for reaction_id in reaction_ids:
        if reaction_id in seen or not adjacency[reaction_id]:
            continue
        members = _component(reaction_id, adjacency, seen)
        cluster_edges = [
            edge
            for pair, edge in edges_by_pair.items()
            if pair[0] in members and pair[1] in members
        ]
        clusters.append(_strict_cluster_payload(members, cluster_edges))
    return sorted(clusters, key=lambda item: item["cluster_id"])


def _semantic_groups(reaction_ids: list[str], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    adjacency: dict[str, set[str]] = {reaction_id: set() for reaction_id in reaction_ids}
    edges_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    for edge in edges:
        left = edge["from_reaction_entity_id"]
        right = edge["to_reaction_entity_id"]
        adjacency[left].add(right)
        adjacency[right].add(left)
        edges_by_pair[(left, right)] = edge

    groups: list[dict[str, Any]] = []
    seen: set[str] = set()
    for reaction_id in reaction_ids:
        if reaction_id in seen or not adjacency[reaction_id]:
            continue
        members = _component(reaction_id, adjacency, seen)
        group_edges = [
            edge
            for pair, edge in edges_by_pair.items()
            if pair[0] in members and pair[1] in members
        ]
        groups.append(_semantic_group_payload(members, group_edges))
    return sorted(groups, key=lambda item: item["group_id"])


def _component(start: str, adjacency: Mapping[str, set[str]], seen: set[str]) -> list[str]:
    stack = [start]
    members: list[str] = []
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        members.append(current)
        stack.extend(sorted(adjacency[current] - seen, reverse=True))
    return sorted(members)


def _strict_cluster_payload(members: list[str], edges: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [float(edge["score"]) for edge in edges]
    return {
        "cluster_id": f"strict-reaction-cluster::{'::'.join(members)}",
        "reaction_entity_ids": members,
        "representative_reaction_entity_id": _representative(members, edges),
        "mean_score": round(sum(scores) / len(scores), 6),
        "min_edge_score": round(min(scores), 6),
        "basis_summary": _basis_summary(edges),
        "warnings": _warnings(edges),
    }


def _semantic_group_payload(members: list[str], edges: list[dict[str, Any]]) -> dict[str, Any]:
    scores = [float(edge["score"]) for edge in edges]
    return {
        "group_id": f"semantic-reaction-group::{'::'.join(members)}",
        "reaction_entity_ids": members,
        "mean_score": round(sum(scores) / len(scores), 6),
        "basis_summary": _basis_summary(edges),
        "warnings": _warnings(edges),
    }


def _representative(members: list[str], edges: list[dict[str, Any]]) -> str:
    degree: dict[str, int] = defaultdict(int)
    score_sum: dict[str, float] = defaultdict(float)
    for edge in edges:
        left = edge["from_reaction_entity_id"]
        right = edge["to_reaction_entity_id"]
        score = float(edge["score"])
        degree[left] += 1
        degree[right] += 1
        score_sum[left] += score
        score_sum[right] += score
    return sorted(members, key=lambda item: (-degree[item], -score_sum[item], item))[0]


def _basis_summary(edges: list[dict[str, Any]]) -> list[str]:
    return sorted({basis for edge in edges for basis in _strings(edge.get("basis"))})


def _warnings(edges: list[dict[str, Any]]) -> list[str]:
    return sorted({warning for edge in edges for warning in _strings(edge.get("warnings"))})


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]
