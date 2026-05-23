from __future__ import annotations

from typing import Any, Literal, TypedDict

REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION = "chemd-reaction-intelligence-job/v0.1"
REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION = "chemd-reaction-intelligence-artifact/v0.1"

ProviderKind = Literal[
    "rdkit_fingerprint",
    "rxnmapper",
    "rxnfp",
    "hybrid_graph",
    "tmap_layout",
]
ProviderStatus = Literal["PASS", "SKIP", "ERROR"]
MissingDependencyPolicy = Literal["skip", "error", "fallback"]
PerReactionFailurePolicy = Literal["warn", "error"]
Confidence = Literal["high", "medium", "low"]
ComputedSimilarityBasis = Literal[
    "rdkit_fingerprint_tanimoto",
    "rxnfp_cosine",
    "same_reaction_center",
    "compatible_reaction_center",
    "conflicting_reaction_center",
    "semantic_family_support",
    "semantic_procedure_support",
    "hybrid_consensus",
]


class ReactionIntelligenceContractError(ValueError):
    """Raised when a reaction intelligence JSON contract is invalid."""


class ReactionInput(TypedDict, total=False):
    reaction_entity_id: str
    document_id: str
    source_range: Any
    canonical_rxn_smiles: str
    participant_signature: str
    reaction_family: str
    procedure_signature: str
    condition_signature: str
    source_hash: str


class ProviderPolicy(TypedDict):
    missing_dependency: MissingDependencyPolicy
    per_reaction_failure: PerReactionFailurePolicy
    allow_network: Literal[False]


class ReactionIntelligenceJobInput(TypedDict):
    schema_version: str
    job_id: str
    graph_index_id: str
    source_compile_run_ids: list[str]
    reactions: list[ReactionInput]
    requested_providers: list[ProviderKind]
    provider_policy: ProviderPolicy


class ProviderReport(TypedDict, total=False):
    provider_id: str
    kind: ProviderKind
    status: ProviderStatus
    package_name: str
    package_version: str
    model_id: str
    model_hash: str
    warnings: list[str]


class ComputedFeature(TypedDict, total=False):
    reaction_entity_id: str
    source_hash: str
    canonical_rxn_smiles: str
    fingerprint_refs: list[dict[str, Any]]
    atom_mapping: dict[str, Any]
    reaction_center: dict[str, Any]
    warnings: list[str]


class RequiredComputedSimilarityEdge(TypedDict):
    edge_id: str
    from_reaction_entity_id: str
    to_reaction_entity_id: str
    score: float
    confidence: Confidence
    basis: list[ComputedSimilarityBasis]
    provider_ids: list[str]
    source_hashes: list[str]
    warnings: list[str]


class ComputedSimilarityEdge(RequiredComputedSimilarityEdge, total=False):
    metadata: dict[str, Any]


class ReactionIntelligenceArtifact(TypedDict, total=False):
    schema_version: str
    artifact_id: str
    job_id: str
    graph_index_id: str
    generated_at: str
    providers: list[ProviderReport]
    reaction_features: list[ComputedFeature]
    similarity_edges: list[ComputedSimilarityEdge]
    strict_reaction_clusters: list[dict[str, Any]]
    candidate_reaction_neighbors: list[dict[str, Any]]
    semantic_reaction_groups: list[dict[str, Any]]
    layout: dict[str, Any]
    warnings: list[str]


PROVIDER_KINDS = {"rdkit_fingerprint", "rxnmapper", "rxnfp", "hybrid_graph", "tmap_layout"}
PROVIDER_STATUSES = {"PASS", "SKIP", "ERROR"}
MISSING_DEPENDENCY_POLICIES = {"skip", "error", "fallback"}
PER_REACTION_FAILURE_POLICIES = {"warn", "error"}
CONFIDENCE_VALUES = {"high", "medium", "low"}
COMPUTED_SIMILARITY_BASIS = {
    "rdkit_fingerprint_tanimoto",
    "rxnfp_cosine",
    "same_reaction_center",
    "compatible_reaction_center",
    "conflicting_reaction_center",
    "semantic_family_support",
    "semantic_procedure_support",
    "hybrid_consensus",
}


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _is_string(value: Any) -> bool:
    return isinstance(value, str) and len(value) > 0


def _is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(_is_string(item) for item in value)


def _require_string(
    errors: list[str],
    payload: dict[str, Any],
    field: str,
    label: str | None = None,
) -> None:
    if not _is_string(payload.get(field)):
        errors.append(f"{label or field} is required")


def _validate_provider_policy(value: Any, errors: list[str]) -> None:
    if not _is_object(value):
        errors.append("provider_policy is required")
        return
    if value.get("missing_dependency") not in MISSING_DEPENDENCY_POLICIES:
        errors.append("provider_policy.missing_dependency is invalid")
    if value.get("per_reaction_failure") not in PER_REACTION_FAILURE_POLICIES:
        errors.append("provider_policy.per_reaction_failure is invalid")
    if value.get("allow_network") is not False:
        errors.append("provider_policy.allow_network must be false")


def _validate_reaction(value: Any, index: int, errors: list[str]) -> None:
    if not _is_object(value):
        errors.append(f"reactions[{index}] must be an object")
        return
    for field in (
        "reaction_entity_id",
        "document_id",
        "canonical_rxn_smiles",
        "participant_signature",
        "source_hash",
    ):
        _require_string(errors, value, field, f"reactions[{index}].{field}")


def validate_job_input(value: Any) -> list[str]:
    errors: list[str] = []
    if not _is_object(value):
        return ["input must be an object"]
    if value.get("schema_version") != REACTION_INTELLIGENCE_JOB_SCHEMA_VERSION:
        errors.append("schema_version is invalid")
    for field in ("job_id", "graph_index_id"):
        _require_string(errors, value, field)
    if not _is_string_list(value.get("source_compile_run_ids")):
        errors.append("source_compile_run_ids must be strings")
    if not _is_string_list(value.get("requested_providers")):
        errors.append("requested_providers must be strings")
    elif any(item not in PROVIDER_KINDS for item in value["requested_providers"]):
        errors.append("requested_providers contains invalid provider")
    if not isinstance(value.get("reactions"), list):
        errors.append("reactions must be a list")
    else:
        for index, item in enumerate(value["reactions"]):
            _validate_reaction(item, index, errors)
    _validate_provider_policy(value.get("provider_policy"), errors)
    return errors


def _validate_provider_report(value: Any, index: int, errors: list[str]) -> None:
    if not _is_object(value):
        errors.append(f"providers[{index}] must be an object")
        return
    for field in ("provider_id", "kind", "status"):
        _require_string(errors, value, field, f"providers[{index}].{field}")
    if value.get("kind") not in PROVIDER_KINDS:
        errors.append(f"providers[{index}].kind is invalid")
    if value.get("status") not in PROVIDER_STATUSES:
        errors.append(f"providers[{index}].status is invalid")
    if not _is_string_list(value.get("warnings")):
        errors.append(f"providers[{index}].warnings must be strings")


def _validate_computed_feature(value: Any, index: int, errors: list[str]) -> None:
    if not _is_object(value):
        errors.append(f"reaction_features[{index}] must be an object")
        return
    for field in ("reaction_entity_id", "source_hash", "canonical_rxn_smiles"):
        _require_string(errors, value, field, f"reaction_features[{index}].{field}")
    if not isinstance(value.get("fingerprint_refs"), list):
        errors.append(f"reaction_features[{index}].fingerprint_refs must be a list")
    if not _is_string_list(value.get("warnings")):
        errors.append(f"reaction_features[{index}].warnings must be strings")


def _validate_computed_edge(value: Any, index: int, errors: list[str]) -> None:
    if not _is_object(value):
        errors.append(f"similarity_edges[{index}] must be an object")
        return
    for field in ("edge_id", "from_reaction_entity_id", "to_reaction_entity_id"):
        _require_string(errors, value, field, f"similarity_edges[{index}].{field}")
    if not isinstance(value.get("score"), (int, float)):
        errors.append(f"similarity_edges[{index}].score must be a number")
    if value.get("confidence") not in CONFIDENCE_VALUES:
        errors.append(f"similarity_edges[{index}].confidence is invalid")
    for field in ("basis", "provider_ids", "source_hashes", "warnings"):
        if not _is_string_list(value.get(field)):
            errors.append(f"similarity_edges[{index}].{field} must be strings")
    if _is_string_list(value.get("basis")) and any(
        item not in COMPUTED_SIMILARITY_BASIS for item in value["basis"]
    ):
        errors.append(f"similarity_edges[{index}].basis contains invalid basis")
    if value.get("metadata") is not None and not _is_object(value.get("metadata")):
        errors.append(f"similarity_edges[{index}].metadata must be an object")
    contributions = value.get("contributions")
    if contributions is not None:
        if not isinstance(contributions, list):
            errors.append(f"similarity_edges[{index}].contributions must be a list")
        else:
            for contribution_index, contribution in enumerate(contributions):
                _validate_similarity_contribution(
                    contribution, index, contribution_index, errors
                )


def _validate_similarity_contribution(
    value: Any, edge_index: int, contribution_index: int, errors: list[str]
) -> None:
    label = f"similarity_edges[{edge_index}].contributions[{contribution_index}]"
    if not _is_object(value):
        errors.append(f"{label} must be an object")
        return
    _require_string(errors, value, "component", f"{label}.component")
    if not isinstance(value.get("score"), (int, float)):
        errors.append(f"{label}.score must be a number")
    if not isinstance(value.get("weight"), (int, float)):
        errors.append(f"{label}.weight must be a number")
    if not _is_string_list(value.get("basis")):
        errors.append(f"{label}.basis must be strings")


def _validate_basis_values(value: Any, label: str, errors: list[str]) -> None:
    if _is_string_list(value) and any(item not in COMPUTED_SIMILARITY_BASIS for item in value):
        errors.append(f"{label} contains invalid basis")


def _validate_strict_cluster(value: Any, index: int, errors: list[str]) -> None:
    label = f"strict_reaction_clusters[{index}]"
    if not _is_object(value):
        errors.append(f"{label} must be an object")
        return
    for field in ("cluster_id", "representative_reaction_entity_id"):
        _require_string(errors, value, field, f"{label}.{field}")
    for field in ("reaction_entity_ids", "basis_summary", "warnings"):
        if not _is_string_list(value.get(field)):
            errors.append(f"{label}.{field} must be strings")
    for field in ("mean_score", "min_edge_score"):
        if not isinstance(value.get(field), (int, float)):
            errors.append(f"{label}.{field} must be a number")
    _validate_basis_values(value.get("basis_summary"), f"{label}.basis_summary", errors)


def _validate_candidate_neighbor(value: Any, index: int, errors: list[str]) -> None:
    label = f"candidate_reaction_neighbors[{index}]"
    if not _is_object(value):
        errors.append(f"{label} must be an object")
        return
    for field in ("edge_id", "from_reaction_entity_id", "to_reaction_entity_id"):
        _require_string(errors, value, field, f"{label}.{field}")
    if not isinstance(value.get("score"), (int, float)):
        errors.append(f"{label}.score must be a number")
    for field in ("basis", "warnings"):
        if not _is_string_list(value.get(field)):
            errors.append(f"{label}.{field} must be strings")
    _validate_basis_values(value.get("basis"), f"{label}.basis", errors)


def _validate_semantic_group(value: Any, index: int, errors: list[str]) -> None:
    label = f"semantic_reaction_groups[{index}]"
    if not _is_object(value):
        errors.append(f"{label} must be an object")
        return
    _require_string(errors, value, "group_id", f"{label}.group_id")
    if not isinstance(value.get("mean_score"), (int, float)):
        errors.append(f"{label}.mean_score must be a number")
    for field in ("reaction_entity_ids", "basis_summary", "warnings"):
        if not _is_string_list(value.get(field)):
            errors.append(f"{label}.{field} must be strings")
    _validate_basis_values(value.get("basis_summary"), f"{label}.basis_summary", errors)


def validate_artifact(value: Any) -> list[str]:
    errors: list[str] = []
    if not _is_object(value):
        return ["artifact must be an object"]
    if value.get("schema_version") != REACTION_INTELLIGENCE_ARTIFACT_SCHEMA_VERSION:
        errors.append("schema_version is invalid")
    for field in ("artifact_id", "job_id", "graph_index_id", "generated_at"):
        _require_string(errors, value, field)
    for field, validator in (
        ("providers", _validate_provider_report),
        ("reaction_features", _validate_computed_feature),
        ("similarity_edges", _validate_computed_edge),
        ("strict_reaction_clusters", _validate_strict_cluster),
        ("candidate_reaction_neighbors", _validate_candidate_neighbor),
        ("semantic_reaction_groups", _validate_semantic_group),
    ):
        items = value.get(field)
        if not isinstance(items, list):
            errors.append(f"{field} must be a list")
        else:
            for index, item in enumerate(items):
                validator(item, index, errors)
    if not _is_string_list(value.get("warnings")):
        errors.append("warnings must be strings")
    return errors


def require_valid_job_input(value: Any) -> ReactionIntelligenceJobInput:
    errors = validate_job_input(value)
    if errors:
        raise ReactionIntelligenceContractError("; ".join(errors))
    return value


def require_valid_artifact(value: Any) -> ReactionIntelligenceArtifact:
    errors = validate_artifact(value)
    if errors:
        raise ReactionIntelligenceContractError("; ".join(errors))
    return value
