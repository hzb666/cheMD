from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from chem_cluster_service.intelligence.contracts import (
    ProviderKind,
    ProviderReport,
    ReactionInput,
    ReactionIntelligenceArtifact,
    REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION,
    require_valid_job_input,
    validate_job_input,
)
from chem_cluster_service.intelligence.io import ClassifiedEnvelope, validation_envelope
from chem_cluster_service.intelligence.providers.rdkit_fingerprint import run_rdkit_fingerprint_provider
from chem_cluster_service.intelligence.providers.rxnfp_provider import run_rxnfp_provider
from chem_cluster_service.intelligence.providers.rxnmapper_provider import RXNMapperProvider
from chem_cluster_service.intelligence.providers.tmap_layout import run_tmap_layout_provider
from chem_cluster_service.intelligence.similarity import HYBRID_PROVIDER_ID, build_hybrid_similarity_edges


ProviderRunner = Callable[[list[ReactionInput]], Any]
ProviderFactory = Callable[[ProviderKind], ProviderRunner | None]
Clock = Callable[[], datetime]


@dataclass(frozen=True)
class PipelineRunResult:
    exit_code: int
    payload: ReactionIntelligenceArtifact | ClassifiedEnvelope


@dataclass(frozen=True)
class _ProviderOutput:
    provider: ProviderReport
    reaction_features: list[dict[str, Any]]
    similarity_edges: list[dict[str, Any]]
    warnings: list[str]
    layout: dict[str, Any] | None = None


def run_reaction_intelligence_pipeline(
    payload: dict[str, Any],
    *,
    provider_factory: ProviderFactory | None = None,
    clock: Clock | None = None,
) -> PipelineRunResult:
    errors = validate_job_input(payload)
    if errors:
        return PipelineRunResult(
            exit_code=1,
            payload=validation_envelope("invalid_input", "Reaction intelligence job input is invalid.", errors),
        )

    job = require_valid_job_input(payload)
    factory = provider_factory or default_provider_factory
    requested = list(dict.fromkeys(job["requested_providers"]))
    provider_reports: list[ProviderReport] = []
    provider_outputs: list[_ProviderOutput] = []
    artifact_warnings: list[str] = []
    exit_code = 0

    for provider_kind in requested:
        if provider_kind == "hybrid_graph":
            provider_outputs.append(_run_hybrid_graph_provider(job, provider_outputs))
            provider_reports.append(provider_outputs[-1].provider)
            continue
        if provider_kind == "tmap_layout":
            output = _run_tmap_layout_provider(job, provider_outputs)
        else:
            output = _run_baseline_provider(provider_kind, job["reactions"], factory)
            output = _apply_missing_dependency_policy(output, job["provider_policy"]["missing_dependency"])
        if output.provider["status"] == "ERROR":
            exit_code = 2
        artifact_warnings.extend(output.warnings)
        provider_outputs.append(output)
        provider_reports.append(output.provider)

    generated_at = _format_generated_at(clock)
    artifact: ReactionIntelligenceArtifact = {
        "schema_version": REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION,
        "artifact_id": f"reaction-intelligence-artifact::{job['job_id']}",
        "job_id": job["job_id"],
        "graph_index_id": job["graph_index_id"],
        "generated_at": generated_at,
        "providers": provider_reports,
        "reaction_features": _merge_reaction_features(provider_outputs),
        "similarity_edges": _collect_similarity_edges(provider_outputs),
        "warnings": _dedupe_strings(artifact_warnings),
    }
    layout = _first_layout(provider_outputs)
    if layout is not None:
        artifact["layout"] = layout
    return PipelineRunResult(exit_code=exit_code, payload=artifact)


def default_provider_factory(provider_kind: ProviderKind) -> ProviderRunner | None:
    runners: dict[str, ProviderRunner] = {
        "rdkit_fingerprint": run_rdkit_fingerprint_provider,
        "rxnmapper": RXNMapperProvider().run,
        "rxnfp": run_rxnfp_provider,
    }
    return runners.get(provider_kind)


def _run_baseline_provider(
    provider_kind: ProviderKind,
    reactions: list[ReactionInput],
    provider_factory: ProviderFactory,
) -> _ProviderOutput:
    runner = provider_factory(provider_kind)
    if runner is None:
        return _provider_not_available(provider_kind, "provider_not_registered")
    try:
        return _normalize_provider_output(runner(reactions), provider_kind)
    except Exception as exc:  # noqa: BLE001 - provider boundary classifies failures.
        return _provider_error(provider_kind, f"provider_failed:{type(exc).__name__}")


def _run_hybrid_graph_provider(
    job: Mapping[str, Any],
    provider_outputs: list[_ProviderOutput],
) -> _ProviderOutput:
    edges = build_hybrid_similarity_edges(job, provider_outputs, provider_id=HYBRID_PROVIDER_ID)
    return _ProviderOutput(
        provider={
            "provider_id": HYBRID_PROVIDER_ID,
            "kind": "hybrid_graph",
            "status": "PASS",
            "warnings": [],
        },
        reaction_features=[],
        similarity_edges=edges,
        warnings=[],
    )


def _run_tmap_layout_provider(
    job: Mapping[str, Any],
    provider_outputs: list[_ProviderOutput],
) -> _ProviderOutput:
    reaction_ids = [
        item["reaction_entity_id"]
        for item in job.get("reactions", [])
        if isinstance(item, Mapping) and isinstance(item.get("reaction_entity_id"), str)
    ]
    edges = _object_list(job.get("reaction_similarity_edges")) + _collect_similarity_edges(provider_outputs)
    result = run_tmap_layout_provider(
        reaction_ids,
        edges,  # type: ignore[arg-type]
        missing_dependency=job["provider_policy"]["missing_dependency"],
    )
    return _ProviderOutput(
        provider=dict(result.provider),
        reaction_features=[],
        similarity_edges=[],
        warnings=list(result.warnings),
        layout=dict(result.layout) if isinstance(result.layout, Mapping) else None,
    )


def _first_layout(provider_outputs: list[_ProviderOutput]) -> dict[str, Any] | None:
    for output in provider_outputs:
        if output.layout is not None:
            return output.layout
    return None


def _apply_missing_dependency_policy(output: _ProviderOutput, policy: str) -> _ProviderOutput:
    warnings = list(output.provider.get("warnings", []))
    if output.provider["status"] != "SKIP":
        return output
    if policy == "error":
        warnings.append("missing_dependency_policy_error")
        output.provider["status"] = "ERROR"
    elif policy == "fallback":
        warnings.append("fallback_policy_treated_as_skip")
    output.provider["warnings"] = _dedupe_strings(warnings)
    return _ProviderOutput(output.provider, output.reaction_features, output.similarity_edges, list(output.provider["warnings"]))


def _normalize_provider_output(value: Any, provider_kind: ProviderKind) -> _ProviderOutput:
    provider = _object_field(value, "provider")
    if provider is None:
        return _provider_error(provider_kind, "provider_result_missing_report")
    normalized_provider = dict(provider)
    warnings = _string_list(_field(value, "warnings"))
    normalized_provider["warnings"] = _dedupe_strings(
        _string_list(normalized_provider.get("warnings")) + warnings,
    )
    return _ProviderOutput(
        provider=normalized_provider,  # type: ignore[arg-type]
        reaction_features=_object_list(_field(value, "reaction_features")),
        similarity_edges=_object_list(_field(value, "similarity_edges")),
        warnings=list(normalized_provider["warnings"]),
    )


def _provider_not_available(provider_kind: ProviderKind, warning: str) -> _ProviderOutput:
    report = _provider_report(provider_kind, "SKIP", [warning])
    return _ProviderOutput(report, [], [], list(report["warnings"]))


def _provider_error(provider_kind: ProviderKind, warning: str) -> _ProviderOutput:
    report = _provider_report(provider_kind, "ERROR", [warning])
    return _ProviderOutput(report, [], [], list(report["warnings"]))


def _provider_report(provider_kind: ProviderKind, status: str, warnings: list[str]) -> ProviderReport:
    return {
        "provider_id": _provider_id(provider_kind),
        "kind": provider_kind,
        "status": status,  # type: ignore[typeddict-item]
        "warnings": _dedupe_strings(warnings),
    }


def _provider_id(provider_kind: str) -> str:
    return {
        "rdkit_fingerprint": "provider::rdkit-fingerprint",
        "rxnmapper": "provider::rxnmapper",
        "rxnfp": "provider::rxnfp",
        "hybrid_graph": HYBRID_PROVIDER_ID,
        "tmap_layout": "provider::tmap-layout",
    }[provider_kind]


def _merge_reaction_features(provider_outputs: list[_ProviderOutput]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for output in provider_outputs:
        for feature in output.reaction_features:
            reaction_id = feature.get("reaction_entity_id")
            if not isinstance(reaction_id, str) or not reaction_id:
                continue
            if reaction_id not in merged:
                merged[reaction_id] = _feature_base(feature)
                order.append(reaction_id)
            target = merged[reaction_id]
            target["fingerprint_refs"].extend(_object_list(feature.get("fingerprint_refs")))
            target["warnings"] = _dedupe_strings(target["warnings"] + _string_list(feature.get("warnings")))
            for field in ("atom_mapping", "reaction_center"):
                if isinstance(feature.get(field), dict):
                    target[field] = dict(feature[field])
    return [merged[reaction_id] for reaction_id in order]


def _feature_base(feature: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "reaction_entity_id": str(feature.get("reaction_entity_id") or ""),
        "source_hash": str(feature.get("source_hash") or ""),
        "canonical_rxn_smiles": str(feature.get("canonical_rxn_smiles") or ""),
        "fingerprint_refs": [],
        "warnings": [],
    }


def _collect_similarity_edges(provider_outputs: list[_ProviderOutput]) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    for output in provider_outputs:
        edges.extend(output.similarity_edges)
    return edges


def _field(value: Any, field: str) -> Any:
    if isinstance(value, Mapping):
        return value.get(field)
    return getattr(value, field, None)


def _object_field(value: Any, field: str) -> dict[str, Any] | None:
    item = _field(value, field)
    return dict(item) if isinstance(item, Mapping) else None


def _object_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, Mapping)]


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _dedupe_strings(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def _format_generated_at(clock: Clock | None) -> str:
    now = clock() if clock else datetime.now(UTC)
    return now.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
