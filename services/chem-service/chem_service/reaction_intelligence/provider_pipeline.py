from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from chem_service.reaction_intelligence.contracts import (
    ReactionIntelligenceJob,
    ReactionIntelligenceReaction,
)
from chem_service.reaction_intelligence.providers.drfp_fingerprint import (
    DrfpFingerprintProvider,
)
from chem_service.reaction_intelligence.providers.rdkit_fingerprint import (
    RdkitReactionFingerprintProvider,
)
from chem_service.reaction_intelligence.providers.rxnfp_provider import RxnfpProvider
from chem_service.reaction_intelligence.providers.rxnmapper_provider import RxnMapperProvider

DEFAULT_PROVIDERS = ("drfp", "rdkit_fingerprint", "rxnfp", "reaction_center")


def job_reactions(job: Mapping[str, Any]) -> list[dict[str, Any]]:
    reactions = job.get("reactions")
    if not isinstance(reactions, list):
        return []
    return [reaction for reaction in reactions if isinstance(reaction, dict)]


def requested_providers(job: Mapping[str, Any]) -> list[str]:
    options = job.get("options")
    option_providers = options.get("providers") if isinstance(options, dict) else None
    providers = option_providers or job.get("requested_providers") or job.get("requestedProviders")
    if not isinstance(providers, list):
        return list(DEFAULT_PROVIDERS)
    selected = [provider for provider in providers if provider in DEFAULT_PROVIDERS]
    return selected or list(DEFAULT_PROVIDERS)


def semantic_edges(job: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    for key in ("semantic_edges", "semanticEdges", "similarityEdges", "edges"):
        value = job.get(key)
        if isinstance(value, list):
            return [edge for edge in value if isinstance(edge, dict)]
    return []


def cluster_threshold(job: Mapping[str, Any]) -> float:
    return _read_float_option(job, "cluster_threshold", 0.72)


def min_cluster_size(job: Mapping[str, Any]) -> int:
    value = _read_float_option(job, "min_cluster_size", 2.0)
    return max(1, int(value))


def layout_requested(job: Mapping[str, Any]) -> bool:
    options = job.get("options")
    if isinstance(options, dict) and isinstance(options.get("layout"), bool):
        return bool(options["layout"])
    return bool(job.get("layout"))


def compute_provider_results(job: Mapping[str, Any]) -> dict[str, list[dict[str, Any]]]:
    reactions = job_reactions(job)
    providers = set(requested_providers(job))
    results: dict[str, list[dict[str, Any]]] = {}
    if "drfp" in providers:
        results["drfp"] = list(DrfpFingerprintProvider().fingerprint_reactions(reactions))
    if "rxnfp" in providers:
        results["rxnfp"] = list(RxnfpProvider().embed_reactions(reactions))
    if "rdkit_fingerprint" in providers:
        results["rdkit_fingerprint"] = _rdkit_results(job, reactions)
    if "reaction_center" in providers:
        results["reaction_center"] = _reaction_center_results(job, reactions)
    return results


def _rdkit_results(job: Mapping[str, Any], reactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    artifact = RdkitReactionFingerprintProvider().run(_provider_job(job, reactions)).to_dict()
    return [item for item in artifact.get("fingerprints", []) if isinstance(item, dict)]


def _reaction_center_results(
    job: Mapping[str, Any],
    reactions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    artifact = RxnMapperProvider().run(_provider_job(job, reactions)).to_dict()
    centers: list[dict[str, Any]] = []
    for mapping in artifact.get("atom_mappings", []):
        if isinstance(mapping, dict):
            center = _center_result(mapping)
            if center is not None:
                centers.append(center)
    return centers


def _center_result(mapping: Mapping[str, Any]) -> dict[str, Any] | None:
    center = mapping.get("reaction_center")
    if not isinstance(center, dict):
        return None
    reaction_id = mapping.get("reaction_id")
    if not isinstance(reaction_id, str):
        return None
    return {**center, "reaction_id": reaction_id, "provider": "reaction_center"}


def _provider_job(
    job: Mapping[str, Any],
    reactions: list[dict[str, Any]],
) -> ReactionIntelligenceJob:
    return ReactionIntelligenceJob(
        job_id=_job_id(job),
        reactions=[
            ReactionIntelligenceReaction(
                reaction_id=_reaction_id(reaction),
                reaction_smiles=_reaction_smiles(reaction),
            )
            for reaction in reactions
            if _reaction_id(reaction) and _reaction_smiles(reaction)
        ],
    )


def _job_id(job: Mapping[str, Any]) -> str:
    value = job.get("job_id") or job.get("jobId")
    return value if isinstance(value, str) and value.strip() else "reaction-intelligence-job"


def _reaction_id(reaction: Mapping[str, Any]) -> str:
    value = reaction.get("reaction_id") or reaction.get("id") or reaction.get("reactionId")
    return value.strip() if isinstance(value, str) and value.strip() else ""


def _reaction_smiles(reaction: Mapping[str, Any]) -> str:
    for key in ("reaction_smiles", "rxn_smiles", "equation", "reactionSmiles"):
        value = reaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _read_float_option(job: Mapping[str, Any], key: str, fallback: float) -> float:
    options = job.get("options")
    value = options.get(key) if isinstance(options, dict) else job.get(key)
    return float(value) if isinstance(value, int | float) else fallback
