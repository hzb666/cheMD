from __future__ import annotations

import importlib
from collections.abc import Mapping, Sequence
from typing import Any

PROVIDER_NAME = "tmap"
STATUS_COMPUTED = "computed"
STATUS_SKIPPED = "skipped"

def build_tmap_layout(job: Mapping[str, Any], *, tmap_module: Any | None = None) -> dict[str, Any]:
    reaction_ids = _collect_reaction_ids(job)
    edges, edge_warnings = _collect_tmap_edges(job, reaction_ids)
    warnings = list(edge_warnings)

    if not reaction_ids:
        return _skip_result("no_reactions", "No reaction ids were provided.", warnings)

    if len(reaction_ids) == 1:
        return {
            "provider": _provider_status(STATUS_COMPUTED, "single_vertex"),
            "layout": {
                "kind": "tmap",
                "positions": [_position(reaction_ids[0], 0, 0.0, 0.0)],
                "edges": [],
                "diagnostics": {
                    "reactionCount": 1,
                    "inputEdgeCount": 0,
                    "layoutEdgeCount": 0,
                    "vertexIndex": {reaction_ids[0]: 0},
                    "note": "Single reaction laid out at the origin without importing tmap.",
                },
            },
            "warnings": warnings,
        }

    if not edges:
        return _skip_result(
            "no_similarity_edges",
            "TMAP layout requires similarity edges.",
            warnings,
        )

    tmap_result = _load_tmap(tmap_module)
    if tmap_result["status"] != STATUS_COMPUTED:
        return _skip_result(tmap_result["reason"], tmap_result["message"], warnings)

    module = tmap_result["module"]
    return _run_tmap_layout(module, reaction_ids, edges, warnings)


def _run_tmap_layout(
    tmap_module: Any,
    reaction_ids: list[str],
    edges: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, Any]:
    vertex_index = {reaction_id: index for index, reaction_id in enumerate(reaction_ids)}
    tmap_edges = [(edge["sourceIndex"], edge["targetIndex"], edge["distance"]) for edge in edges]

    try:
        config_factory = getattr(tmap_module, "LayoutConfiguration", None)
        config = config_factory() if config_factory is not None else None
        x_values, y_values, source_values, _target_values, _graph_props = (
            tmap_module.layout_from_edge_list(
                len(reaction_ids),
                tmap_edges,
                config=config,
                create_mst=True,
            )
        )
    except Exception as exc:  # noqa: BLE001 - optional native provider must degrade.
        return _skip_result("layout_failed", f"TMAP layout failed: {exc}", warnings)

    positions = [
        _position(reaction_id, index, _float_at(x_values, index), _float_at(y_values, index))
        for index, reaction_id in enumerate(reaction_ids)
    ]
    diagnostics = {
        "reactionCount": len(reaction_ids),
        "inputEdgeCount": len(edges),
        "layoutEdgeCount": len(list(source_values)),
        "vertexIndex": vertex_index,
    }

    return {
        "provider": _provider_status(STATUS_COMPUTED, "layout_from_edge_list"),
        "layout": {
            "kind": "tmap",
            "positions": positions,
            "diagnostics": diagnostics,
        },
        "warnings": warnings,
    }


def _load_tmap(tmap_module: Any | None) -> dict[str, Any]:
    if tmap_module is not None:
        if hasattr(tmap_module, "layout_from_edge_list"):
            return {"status": STATUS_COMPUTED, "module": tmap_module}
        return {
            "status": STATUS_SKIPPED,
            "reason": "provider_missing_api",
            "message": "Injected tmap module does not expose layout_from_edge_list.",
        }

    try:
        module = importlib.import_module("tmap")
    except (ImportError, OSError) as exc:
        return {
            "status": STATUS_SKIPPED,
            "reason": "provider_unavailable",
            "message": f"Optional tmap provider is unavailable: {exc}",
        }

    if not hasattr(module, "layout_from_edge_list"):
        return {
            "status": STATUS_SKIPPED,
            "reason": "provider_missing_api",
            "message": "Optional tmap provider does not expose layout_from_edge_list.",
        }

    return {"status": STATUS_COMPUTED, "module": module}


def _collect_reaction_ids(job: Mapping[str, Any]) -> list[str]:
    ordered_ids: list[str] = []
    seen: set[str] = set()

    for reaction_id in _explicit_reaction_ids(job):
        if reaction_id not in seen:
            ordered_ids.append(reaction_id)
            seen.add(reaction_id)

    discovered_ids: set[str] = set()
    for edge in _raw_edges(job):
        if not isinstance(edge, Mapping):
            continue
        endpoints = (_edge_endpoint(edge, "source"), _edge_endpoint(edge, "target"))
        discovered_ids.update(filter(None, endpoints))
    discovered_ids -= seen
    ordered_ids.extend(sorted(discovered_ids))
    return ordered_ids


def _explicit_reaction_ids(job: Mapping[str, Any]) -> list[str]:
    if isinstance(job.get("reactionIds"), list):
        return list(filter(None, (_as_non_empty_string(value) for value in job["reactionIds"])))

    reactions = job.get("reactions")
    if not isinstance(reactions, list):
        return []

    reaction_ids: list[str] = []
    for reaction in reactions:
        if isinstance(reaction, str):
            reaction_ids.append(reaction)
        elif isinstance(reaction, Mapping):
            reaction_ids.append(_reaction_id_from_mapping(reaction))
    return [reaction_id for reaction_id in reaction_ids if reaction_id]


def _collect_tmap_edges(
    job: Mapping[str, Any],
    reaction_ids: Sequence[str],
) -> tuple[list[dict[str, Any]], list[str]]:
    vertex_index = {reaction_id: index for index, reaction_id in enumerate(reaction_ids)}
    normalized_edges: list[dict[str, Any]] = []
    warnings: list[str] = []
    seen_pairs: set[tuple[int, int]] = set()

    for offset, raw_edge in enumerate(_raw_edges(job)):
        edge = _normalize_edge(raw_edge, vertex_index, offset)
        if edge is None:
            warnings.append(f"Skipped invalid similarity edge at index {offset}.")
            continue
        pair = tuple(sorted((edge["sourceIndex"], edge["targetIndex"])))
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        normalized_edges.append(edge)

    normalized_edges.sort(key=lambda item: (item["sourceIndex"], item["targetIndex"]))
    return normalized_edges, warnings


def _raw_edges(job: Mapping[str, Any]) -> list[Any]:
    for key in ("similarityEdges", "edges"):
        value = job.get(key)
        if isinstance(value, list):
            return value
    graph = job.get("graph")
    if isinstance(graph, Mapping) and isinstance(graph.get("edges"), list):
        return graph["edges"]
    return []


def _normalize_edge(
    raw_edge: Any,
    vertex_index: Mapping[str, int],
    offset: int,
) -> dict[str, Any] | None:
    if not isinstance(raw_edge, Mapping):
        return None

    source_id = _edge_endpoint(raw_edge, "source")
    target_id = _edge_endpoint(raw_edge, "target")
    if not source_id or not target_id or source_id == target_id:
        return None
    if source_id not in vertex_index or target_id not in vertex_index:
        return None

    distance = _edge_distance(raw_edge)
    source_index = vertex_index[source_id]
    target_index = vertex_index[target_id]
    return {
        "sourceIndex": source_index,
        "targetIndex": target_index,
        "distance": distance,
    }


def _edge_endpoint(edge: Mapping[str, Any], side: str) -> str:
    for key in (f"{side}ReactionId", f"{side}Id", side):
        value = edge.get(key)
        if isinstance(value, Mapping):
            value = _reaction_id_from_mapping(value)
        string_value = _as_non_empty_string(value)
        if string_value:
            return string_value

    aliases = ("from", "a") if side == "source" else ("to", "b")
    for key in aliases:
        string_value = _as_non_empty_string(edge.get(key))
        if string_value:
            return string_value
    return ""


def _edge_distance(edge: Mapping[str, Any]) -> float:
    explicit_distance = _as_float(edge.get("distance"))
    if explicit_distance is not None:
        return max(0.0, explicit_distance)

    for key in ("score", "similarity", "weight"):
        similarity = _as_float(edge.get(key))
        if similarity is not None:
            return max(0.0, 1.0 - min(1.0, max(0.0, similarity)))
    return 1.0


def _position(
    reaction_id: str,
    vertex_index: int,
    x_value: float,
    y_value: float,
) -> dict[str, Any]:
    return {"reactionId": reaction_id, "vertexIndex": vertex_index, "x": x_value, "y": y_value}


def _provider_status(status: str, reason: str, message: str = "") -> dict[str, Any]:
    payload = {"name": PROVIDER_NAME, "status": status, "reason": reason}
    if message:
        payload["message"] = message
    return payload


def _skip_result(reason: str, message: str, warnings: list[str]) -> dict[str, Any]:
    return {
        "provider": _provider_status(STATUS_SKIPPED, reason, message),
        "layout": None,
        "warnings": warnings,
    }


def _reaction_id_from_mapping(value: Mapping[str, Any]) -> str:
    values = (_as_non_empty_string(value.get(key)) for key in ("id", "reactionId", "sourceId"))
    return next((item for item in values if item), "")


def _as_non_empty_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _float_at(values: Any, index: int) -> float:
    return float(list(values)[index])
