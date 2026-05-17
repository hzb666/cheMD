from __future__ import annotations

import importlib.util
import json
import math
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, TypedDict

MissingTmapPolicy = Literal["skip", "error", "fallback"]
LayoutEngine = Literal["auto", "fallback", "tmap"]


class ClusterWorkerError(ValueError):
    """Raised when worker input is structurally invalid."""


class WorkerPosition(TypedDict):
    reaction_entity_id: str
    x: float
    y: float


class WorkerEdge(TypedDict, total=False):
    from_reaction_entity_id: str
    to_reaction_entity_id: str
    weight: float
    basis: list[str]


class WorkerInput(TypedDict):
    layout_id: str
    reactions: list[str]
    edges: list[WorkerEdge]


class WorkerOutput(TypedDict):
    layout_engine: str
    layout_engine_version: str
    positions: list[WorkerPosition]
    mst_edges: list[WorkerEdge]
    warnings: list[str]


class ClassifiedEnvelope(TypedDict):
    status: str
    code: str
    message: str
    artifact: WorkerOutput | None


@dataclass(frozen=True)
class WorkerRunResult:
    exit_code: int
    payload: WorkerOutput | ClassifiedEnvelope


def _string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ClusterWorkerError(f"{field} must be a list")
    output = [item for item in value if isinstance(item, str) and item]
    if len(output) != len(value):
        raise ClusterWorkerError(f"{field} must contain only non-empty strings")
    return output


def _edge_list(value: Any) -> list[WorkerEdge]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ClusterWorkerError("edges must be a list")
    edges: list[WorkerEdge] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ClusterWorkerError(f"edges[{index}] must be an object")
        left = item.get("from_reaction_entity_id")
        right = item.get("to_reaction_entity_id")
        if not isinstance(left, str) or not isinstance(right, str):
            raise ClusterWorkerError(f"edges[{index}] must include reaction endpoints")
        edges.append(
            {
                "from_reaction_entity_id": left,
                "to_reaction_entity_id": right,
                "weight": float(item.get("weight", item.get("score", 0.0)) or 0.0),
                "basis": _string_list(item.get("basis", []), f"edges[{index}].basis"),
            }
        )
    return edges


def _from_layout_artifact(payload: dict[str, Any]) -> WorkerInput:
    return {
        "layout_id": str(payload.get("layout_id") or "reaction-layout::input"),
        "reactions": _string_list(
            [
                node.get("reaction_entity_id")
                for node in payload.get("nodes", [])
                if isinstance(node, dict)
            ],
            "nodes.reaction_entity_id",
        ),
        "edges": _edge_list(payload.get("edges", [])),
    }


def _from_training_graph(payload: dict[str, Any]) -> WorkerInput:
    return {
        "layout_id": str(
            payload.get("layout_id")
            or payload.get("graph_index_id")
            or "reaction-layout::training-graph"
        ),
        "reactions": _string_list(
            [
                item.get("reaction_entity_id")
                for item in payload.get("reaction_features", [])
                if isinstance(item, dict)
            ],
            "reaction_features.reaction_entity_id",
        ),
        "edges": _edge_list(
            payload.get("reaction_similarity_edges", payload.get("explicit_edges", []))
        ),
    }


def normalize_worker_input(payload: dict[str, Any]) -> WorkerInput:
    if not isinstance(payload, dict):
        raise ClusterWorkerError("input must be a JSON object")
    if payload.get("schema_version") == "chemd-reaction-cluster-layout/v0.1":
        return _from_layout_artifact(payload)
    if "reaction_features" in payload:
        return _from_training_graph(payload)
    return {
        "layout_id": str(payload.get("layout_id") or "reaction-layout::worker"),
        "reactions": _string_list(payload.get("reactions", []), "reactions"),
        "edges": _edge_list(payload.get("edges", [])),
    }


def _deterministic_positions(reactions: Iterable[str]) -> list[WorkerPosition]:
    reaction_ids = sorted(set(reactions))
    if not reaction_ids:
        return []
    if len(reaction_ids) == 1:
        return [{"reaction_entity_id": reaction_ids[0], "x": 0.0, "y": 0.0}]
    radius = max(64.0, float(len(reaction_ids) * 24))
    positions: list[WorkerPosition] = []
    for index, reaction_id in enumerate(reaction_ids):
        angle = math.tau * index / len(reaction_ids)
        positions.append(
            {
                "reaction_entity_id": reaction_id,
                "x": round(math.cos(angle) * radius, 6),
                "y": round(math.sin(angle) * radius, 6),
            }
        )
    return positions


def build_worker_layout_output(worker_input: WorkerInput) -> WorkerOutput:
    return {
        "layout_engine": "worker",
        "layout_engine_version": "deterministic-fallback/v0.1",
        "positions": _deterministic_positions(worker_input["reactions"]),
        "mst_edges": [],
        "warnings": ["deterministic_fallback_layout_used"],
    }


def has_tmap() -> bool:
    return importlib.util.find_spec("tmap") is not None


def classify_missing_tmap(policy: MissingTmapPolicy, worker_input: WorkerInput) -> WorkerRunResult:
    if policy == "fallback":
        return WorkerRunResult(exit_code=0, payload=build_worker_layout_output(worker_input))
    envelope: ClassifiedEnvelope = {
        "status": "SKIP" if policy == "skip" else "ERROR",
        "code": "tmap_dependency_missing",
        "message": "Python package 'tmap' is not importable in this environment.",
        "artifact": None,
    }
    return WorkerRunResult(exit_code=0 if policy == "skip" else 2, payload=envelope)


def run_layout_worker(
    payload: dict[str, Any],
    *,
    engine: LayoutEngine = "auto",
    missing_tmap: MissingTmapPolicy = "skip",
) -> WorkerRunResult:
    worker_input = normalize_worker_input(payload)
    if engine == "fallback":
        return WorkerRunResult(exit_code=0, payload=build_worker_layout_output(worker_input))
    if not has_tmap():
        return classify_missing_tmap(missing_tmap, worker_input)
    # TMAP integration stays isolated here; until the runtime API is pinned, keep
    # the worker deterministic instead of leaking optional dependency details.
    output = build_worker_layout_output(worker_input)
    output["warnings"] = ["tmap_available_but_deterministic_fallback_used"]
    return WorkerRunResult(exit_code=0, payload=output)


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ClusterWorkerError(f"invalid JSON: {error.msg}") from error
    if not isinstance(value, dict):
        raise ClusterWorkerError("input JSON must be an object")
    return value


def write_json(
    path: Path, payload: WorkerOutput | ClassifiedEnvelope, pretty: bool = False
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2 if pretty else None, sort_keys=True) + "\n",
        encoding="utf-8",
    )
