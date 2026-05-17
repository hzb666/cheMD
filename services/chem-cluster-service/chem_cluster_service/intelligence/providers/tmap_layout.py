from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal, Protocol

from chem_cluster_service.intelligence.contracts import ComputedSimilarityEdge, ProviderReport

PROVIDER_ID = "provider::tmap-layout"
PROVIDER_KIND = "tmap_layout"
DEFAULT_LAYOUT_ENGINE_VERSION = "tmap-layout-provider/v0.1"
MissingTmapPolicy = Literal["skip", "error", "fallback"]


@dataclass(frozen=True)
class TmapAdapterInspection:
    available: bool
    package_name: str = "tmap"
    package_version: str | None = None
    warning: str | None = None
    layout_engine: str = "tmap"


@dataclass(frozen=True)
class TmapAdapterLayout:
    positions: Mapping[int, tuple[float, float]] | Sequence[tuple[float, float]]
    mst_edges: Sequence[tuple[int, int, float]] = ()
    warnings: Sequence[str] = ()


class TmapLayoutAdapter(Protocol):
    def inspect(self) -> TmapAdapterInspection: ...
    def layout(
        self, vertex_count: int, edges: list[tuple[int, int, float]]
    ) -> TmapAdapterLayout: ...


@dataclass(frozen=True)
class ProviderResult:
    provider: ProviderReport
    layout: dict[str, Any] | None
    warnings: list[str]


@dataclass(frozen=True)
class _Edge:
    from_index: int
    to_index: int
    weight: float
    from_id: str
    to_id: str
    basis: list[str]
    warnings: list[str]


@dataclass(frozen=True)
class _Graph:
    reaction_ids: list[str]
    index_by_id: dict[str, int]
    edges: list[_Edge]
    warnings: list[str]

    @property
    def edge_list(self) -> list[tuple[int, int, float]]:
        return [(edge.from_index, edge.to_index, edge.weight) for edge in self.edges]


class RealTmapLayoutAdapter:
    def inspect(self) -> TmapAdapterInspection:
        if importlib.util.find_spec("tmap") is None:
            return TmapAdapterInspection(available=False, warning="dependency_not_installed")
        return TmapAdapterInspection(available=True, package_version=_package_version("tmap"))

    def layout(self, vertex_count: int, edges: list[tuple[int, int, float]]) -> TmapAdapterLayout:
        tmap = importlib.import_module("tmap")
        if not hasattr(tmap, "layout_from_edge_list"):
            raise RuntimeError("tmap_layout_from_edge_list_missing")
        return _coerce_adapter_layout(tmap.layout_from_edge_list(vertex_count, edges))


class TmapLayoutProvider:
    provider_id = PROVIDER_ID
    kind = PROVIDER_KIND

    def __init__(
        self,
        *,
        adapter: TmapLayoutAdapter | None = None,
        missing_dependency: MissingTmapPolicy = "skip",
    ) -> None:
        if missing_dependency not in {"skip", "error", "fallback"}:
            raise ValueError("missing_dependency must be skip, error, or fallback")
        self.adapter = adapter or RealTmapLayoutAdapter()
        self.missing_dependency = missing_dependency

    def inspect(self) -> ProviderReport:
        inspection = self.adapter.inspect()
        report: ProviderReport = {
            "provider_id": self.provider_id,
            "kind": self.kind,
            "status": "PASS" if inspection.available else "SKIP",
            "package_name": inspection.package_name,
            "warnings": [],
            "layout_engine": inspection.layout_engine,
        }
        if inspection.package_version:
            report["package_version"] = inspection.package_version
        if inspection.warning:
            report["warnings"] = [inspection.warning]
        return report

    def run(
        self, reaction_ids: list[str], similarity_edges: list[ComputedSimilarityEdge]
    ) -> ProviderResult:
        graph = build_tmap_graph(reaction_ids, similarity_edges)
        provider = self.inspect()
        if provider["status"] == "SKIP":
            return self._missing_result(provider, graph)
        try:
            adapter_layout = self.adapter.layout(len(graph.reaction_ids), graph.edge_list)
        except Exception as exc:  # noqa: BLE001 - provider boundary converts failures.
            warning = f"tmap_layout_failed:{type(exc).__name__}"
            provider["status"] = "ERROR"
            provider["warnings"] = _dedupe(
                list(provider.get("warnings", [])) + graph.warnings + [warning]
            )
            return ProviderResult(provider, None, list(provider["warnings"]))
        adapter_warnings = _strings(adapter_layout.warnings)
        provider["warnings"] = _dedupe(
            list(provider.get("warnings", [])) + graph.warnings + adapter_warnings
        )
        layout = _artifact(
            graph,
            _positions(adapter_layout.positions, graph),
            _mst_edges(adapter_layout.mst_edges, graph),
            str(provider.get("layout_engine") or "tmap-adapter"),
            str(provider.get("package_version") or DEFAULT_LAYOUT_ENGINE_VERSION),
            list(provider["warnings"]),
        )
        return ProviderResult(provider, layout, list(provider["warnings"]))

    def _missing_result(self, provider: ProviderReport, graph: _Graph) -> ProviderResult:
        warnings = _dedupe(list(provider.get("warnings", [])) + graph.warnings)
        if self.missing_dependency == "error":
            provider["status"] = "ERROR"
            provider["warnings"] = warnings
            return ProviderResult(provider, None, warnings)
        if self.missing_dependency == "fallback":
            provider["warnings"] = _dedupe(warnings + ["deterministic_fallback_layout_used"])
            return ProviderResult(
                provider, _fallback(graph, list(provider["warnings"])), list(provider["warnings"])
            )
        provider["warnings"] = warnings
        return ProviderResult(provider, None, warnings)


def run_tmap_layout_provider(
    reaction_ids: list[str],
    similarity_edges: list[ComputedSimilarityEdge],
    *,
    adapter: TmapLayoutAdapter | None = None,
    missing_dependency: MissingTmapPolicy = "skip",
) -> ProviderResult:
    return TmapLayoutProvider(adapter=adapter, missing_dependency=missing_dependency).run(
        reaction_ids, similarity_edges
    )


def build_tmap_graph(
    reaction_ids: list[str], similarity_edges: list[ComputedSimilarityEdge]
) -> _Graph:
    ids = list(dict.fromkeys(item for item in reaction_ids if isinstance(item, str) and item))
    index_by_id = {reaction_id: index for index, reaction_id in enumerate(ids)}
    edges_by_pair: dict[tuple[int, int], _Edge] = {}
    warnings: list[str] = []
    for item in similarity_edges:
        edge = _edge(item, ids, index_by_id)
        if edge is None:
            warnings.append("tmap_layout_similarity_edge_skipped")
            continue
        pair = (edge.from_index, edge.to_index)
        if pair not in edges_by_pair or edge.weight > edges_by_pair[pair].weight:
            edges_by_pair[pair] = edge
    return _Graph(ids, index_by_id, list(edges_by_pair.values()), _dedupe(warnings))


def _edge(item: Mapping[str, Any], ids: list[str], index_by_id: Mapping[str, int]) -> _Edge | None:
    left = item.get("from_reaction_entity_id")
    right = item.get("to_reaction_entity_id")
    weight = _weight(item.get("score", item.get("weight")))
    if not isinstance(left, str) or not isinstance(right, str) or weight is None:
        return None
    if left == right or left not in index_by_id or right not in index_by_id:
        return None
    first, second = sorted((index_by_id[left], index_by_id[right]))
    return _Edge(
        first,
        second,
        weight,
        ids[first],
        ids[second],
        _strings(item.get("basis")),
        _strings(item.get("warnings")),
    )


def _artifact(
    graph: _Graph,
    positions: Mapping[int, tuple[float, float]],
    mst_edges: list[_Edge],
    engine: str,
    version: str,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "layout_engine": engine,
        "layout_engine_version": version,
        "vertex_index_by_reaction_entity_id": dict(graph.index_by_id),
        "reaction_entity_id_by_vertex_index": list(graph.reaction_ids),
        "edge_list": [_edge_payload(edge) for edge in graph.edges],
        "positions": [
            _position_payload(index, graph.reaction_ids[index], positions[index])
            for index in range(len(graph.reaction_ids))
        ],
        "mst_edges": [_edge_payload(edge) for edge in mst_edges],
        "warnings": warnings,
    }


def _fallback(graph: _Graph, warnings: list[str]) -> dict[str, Any]:
    return _artifact(
        graph,
        _circle_positions(len(graph.reaction_ids)),
        _forest(graph.edges),
        "deterministic-fallback",
        "deterministic-circle/v0.1",
        warnings,
    )


def _coerce_adapter_layout(value: Any) -> TmapAdapterLayout:
    if isinstance(value, TmapAdapterLayout):
        return value
    if isinstance(value, Mapping):
        return TmapAdapterLayout(
            value.get("positions", []), value.get("mst_edges", ()), value.get("warnings", ())
        )
    if isinstance(value, Sequence) and len(value) >= 2:
        return TmapAdapterLayout(list(zip(value[0], value[1], strict=False)), _raw_mst(value))
    raise TypeError("tmap layout result is unsupported")


def _positions(value: Any, graph: _Graph) -> dict[int, tuple[float, float]]:
    items = (
        value.items()
        if isinstance(value, Mapping)
        else enumerate(value)
        if isinstance(value, Sequence)
        else []
    )
    positions = _circle_positions(len(graph.reaction_ids))
    for raw_index, raw_point in items:
        index = _index(raw_index, len(graph.reaction_ids))
        point = _point(raw_point)
        if index is not None and point is not None:
            positions[index] = point
    return positions


def _mst_edges(value: Any, graph: _Graph) -> list[_Edge]:
    edges = [_metadata_edge(item, graph) for item in value or []]
    return [edge for edge in edges if edge is not None] or _forest(graph.edges)


def _metadata_edge(value: Any, graph: _Graph) -> _Edge | None:
    if not isinstance(value, Sequence) or len(value) < 2:
        return None
    left, right = (
        _index(value[0], len(graph.reaction_ids)),
        _index(value[1], len(graph.reaction_ids)),
    )
    if left is None or right is None or left == right:
        return None
    first, second = sorted((left, right))
    existing = next(
        (edge for edge in graph.edges if edge.from_index == first and edge.to_index == second), None
    )
    if existing is not None:
        return existing
    weight = _weight(value[2] if len(value) > 2 else 0.0) or 0.0
    return _Edge(
        first, second, weight, graph.reaction_ids[first], graph.reaction_ids[second], [], []
    )


def _forest(edges: list[_Edge]) -> list[_Edge]:
    parent: dict[int, int] = {}
    output: list[_Edge] = []
    for edge in sorted(edges, key=lambda item: item.weight, reverse=True):
        left, right = _root(parent, edge.from_index), _root(parent, edge.to_index)
        if left != right:
            parent[left] = right
            output.append(edge)
    return output


def _root(parent: dict[int, int], value: int) -> int:
    parent.setdefault(value, value)
    if parent[value] != value:
        parent[value] = _root(parent, parent[value])
    return parent[value]


def _edge_payload(edge: _Edge) -> dict[str, Any]:
    return {
        "from_index": edge.from_index,
        "to_index": edge.to_index,
        "from_reaction_entity_id": edge.from_id,
        "to_reaction_entity_id": edge.to_id,
        "weight": edge.weight,
        "basis": list(edge.basis),
        "warnings": list(edge.warnings),
    }


def _position_payload(index: int, reaction_id: str, point: tuple[float, float]) -> dict[str, Any]:
    return {"reaction_entity_id": reaction_id, "vertex_index": index, "x": point[0], "y": point[1]}


def _circle_positions(count: int) -> dict[int, tuple[float, float]]:
    if count <= 1:
        return {0: (0.0, 0.0)} if count == 1 else {}
    radius = max(64.0, float(count * 24))
    return {
        index: (
            round(math.cos(math.tau * index / count) * radius, 6),
            round(math.sin(math.tau * index / count) * radius, 6),
        )
        for index in range(count)
    }


def _raw_mst(value: Sequence[Any]) -> Sequence[tuple[int, int, float]]:
    if len(value) < 4 or not isinstance(value[2], Sequence) or not isinstance(value[3], Sequence):
        return ()
    weights = value[4] if len(value) > 4 and isinstance(value[4], Sequence) else []
    return [
        (int(left), int(right), _weight(weights[index]) or 0.0)
        for index, (left, right) in enumerate(zip(value[2], value[3], strict=False))
    ]


def _weight(value: Any) -> float | None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
    ):
        return None
    return round(max(0.0, min(1.0, float(value))), 6)


def _index(value: Any, upper_bound: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if 0 <= value < upper_bound else None


def _point(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, Sequence) or len(value) < 2:
        return None
    x, y = value[0], value[1]
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return None
    if not math.isfinite(float(x)) or not math.isfinite(float(y)):
        return None
    return round(float(x), 6), round(float(y), 6)


def _strings(value: Any) -> list[str]:
    if isinstance(value, (str, bytes)) or not isinstance(value, Sequence):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in values if item))


def _package_version(package_name: str) -> str | None:
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None
