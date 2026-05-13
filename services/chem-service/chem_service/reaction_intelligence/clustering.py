from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable, Mapping
from typing import Any

ClusterEdge = dict[str, Any]
SimilarityCluster = dict[str, Any]


def assign_similarity_clusters(
    reaction_ids: list[str],
    edges: list[dict[str, Any]],
    threshold: float = 0.72,
    min_cluster_size: int = 2,
) -> list[SimilarityCluster]:
    ordered_ids = _stable_reaction_ids(reaction_ids)
    known_ids = set(ordered_ids)
    adjacency: dict[str, set[str]] = {reaction_id: set() for reaction_id in ordered_ids}
    qualified_edges: list[ClusterEdge] = []

    for edge in edges:
        normalized = _qualified_edge(edge, known_ids, threshold)
        if normalized is None:
            continue
        left = normalized["left"]
        right = normalized["right"]
        adjacency[left].add(right)
        adjacency[right].add(left)
        qualified_edges.append(normalized)

    clusters: list[SimilarityCluster] = []
    visited: set[str] = set()
    for reaction_id in ordered_ids:
        if reaction_id in visited:
            continue
        component = _connected_component(reaction_id, adjacency, visited)
        if len(component) < min_cluster_size:
            continue
        component_edges = _component_edges(component, qualified_edges)
        if component_edges:
            clusters.append(
                _cluster_from_component(
                    component,
                    component_edges,
                    threshold=threshold,
                    min_cluster_size=min_cluster_size,
                )
            )
    return sorted(clusters, key=lambda cluster: cluster["reaction_entity_ids"])


def _stable_reaction_ids(reaction_ids: Iterable[str]) -> list[str]:
    return sorted({reaction_id.strip() for reaction_id in reaction_ids if reaction_id.strip()})


def _qualified_edge(
    edge: Mapping[str, Any],
    known_ids: set[str],
    threshold: float,
) -> ClusterEdge | None:
    left = _edge_endpoint(edge, "from")
    right = _edge_endpoint(edge, "to")
    score = edge.get("score")
    if (
        left is None
        or right is None
        or left == right
        or left not in known_ids
        or right not in known_ids
        or not isinstance(score, int | float)
        or float(score) < threshold
    ):
        return None
    return {
        "left": left,
        "right": right,
        "score": float(score),
        "basis": _basis_values(edge.get("basis")),
        "warnings": _string_values(edge.get("warnings")),
    }


def _edge_endpoint(edge: Mapping[str, Any], side: str) -> str | None:
    value = edge.get(f"{side}_reaction_entity_id") or edge.get(f"{side}_reaction_id")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _basis_values(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return sorted({item for item in value if isinstance(item, str)})
    return []


def _string_values(value: Any) -> list[str]:
    if isinstance(value, list):
        return sorted({item for item in value if isinstance(item, str)})
    return []


def _connected_component(
    start: str,
    adjacency: Mapping[str, set[str]],
    visited: set[str],
) -> list[str]:
    stack = [start]
    component: list[str] = []
    visited.add(start)
    while stack:
        reaction_id = stack.pop()
        component.append(reaction_id)
        for neighbor in sorted(adjacency[reaction_id], reverse=True):
            if neighbor not in visited:
                visited.add(neighbor)
                stack.append(neighbor)
    return sorted(component)


def _component_edges(component: list[str], edges: list[ClusterEdge]) -> list[ClusterEdge]:
    members = set(component)
    return [
        edge
        for edge in sorted(edges, key=_edge_sort_key)
        if edge["left"] in members and edge["right"] in members
    ]


def _edge_sort_key(edge: ClusterEdge) -> tuple[str, str, float]:
    return (edge["left"], edge["right"], edge["score"])


def _cluster_from_component(
    component: list[str],
    edges: list[ClusterEdge],
    *,
    threshold: float,
    min_cluster_size: int,
) -> SimilarityCluster:
    return {
        "cluster_id": _cluster_id(component),
        "reaction_entity_ids": component,
        "representative_reaction_entity_id": _representative(component, edges),
        "mean_score": round(sum(edge["score"] for edge in edges) / len(edges), 6),
        "basis_summary": _unique_sorted(_flatten(edge["basis"] for edge in edges)),
        "warnings": _unique_sorted(_flatten(edge["warnings"] for edge in edges)),
        "metadata": {
            "threshold": threshold,
            "min_cluster_size": min_cluster_size,
            "edge_count": len(edges),
        },
    }


def _representative(component: list[str], edges: list[ClusterEdge]) -> str:
    scores = {reaction_id: 0.0 for reaction_id in component}
    for edge in edges:
        scores[edge["left"]] += edge["score"]
        scores[edge["right"]] += edge["score"]
    return sorted(component, key=lambda reaction_id: (-scores[reaction_id], reaction_id))[0]


def _cluster_id(component: list[str]) -> str:
    payload = json.dumps(component, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _flatten(values: Iterable[list[str]]) -> list[str]:
    flattened: list[str] = []
    for value in values:
        flattened.extend(value)
    return flattened


def _unique_sorted(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})
