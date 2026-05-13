from __future__ import annotations

import importlib
import logging
from collections.abc import Callable
from typing import Any

from chem_service.reaction_intelligence.contracts import (
    AtomMapping,
    ProviderStatus,
    ReactionIntelligenceArtifact,
    ReactionIntelligenceJob,
)
from chem_service.reaction_intelligence.providers.base import (
    REACTION_INTELLIGENCE_SCHEMA_VERSION,
    provider_failed,
    provider_skipped,
)
from chem_service.reaction_intelligence.reaction_center import derive_reaction_center

LOGGER = logging.getLogger(__name__)


def load_rxnmapper() -> Any | None:
    try:
        module = importlib.import_module("rxnmapper")
    except Exception as error:
        LOGGER.info("RXNMapper provider skipped: %s", error)
        return None
    return module.RXNMapper()


class RxnMapperProvider:
    provider_key = "rxnmapper"

    def __init__(
        self,
        *,
        mapper_loader: Callable[[], Any | None] = load_rxnmapper,
        min_center_confidence: float = 0.5,
    ) -> None:
        self._mapper_loader = mapper_loader
        self._min_center_confidence = min_center_confidence

    def run(self, job: ReactionIntelligenceJob) -> ReactionIntelligenceArtifact:
        mapper = self._mapper_loader()
        if mapper is None:
            return provider_skipped(self.provider_key, job.job_id, "RXNMapper is not available.")

        try:
            results = mapper.get_attention_guided_atom_maps(_reaction_smiles(job))
        except (AttributeError, TypeError, ValueError, RuntimeError) as error:
            return provider_failed(self.provider_key, job.job_id, f"RXNMapper failed: {error}")

        atom_mappings = _build_atom_mappings(
            job,
            results,
            provider_key=self.provider_key,
            min_center_confidence=self._min_center_confidence,
        )
        warnings = [warning for mapping in atom_mappings for warning in mapping.warnings]
        return ReactionIntelligenceArtifact(
            schema_version=REACTION_INTELLIGENCE_SCHEMA_VERSION,
            job_id=job.job_id,
            provider_statuses=[
                ProviderStatus(
                    provider=self.provider_key,
                    status="ok" if atom_mappings else "skipped",
                    warnings=warnings,
                    details={"mappingCount": len(atom_mappings)},
                )
            ],
            atom_mappings=atom_mappings,
            warnings=warnings,
        )


def _reaction_smiles(job: ReactionIntelligenceJob) -> list[str]:
    return [reaction.reaction_smiles for reaction in job.reactions]


def _build_atom_mappings(
    job: ReactionIntelligenceJob,
    results: Any,
    *,
    provider_key: str,
    min_center_confidence: float,
) -> list[AtomMapping]:
    mappings: list[AtomMapping] = []
    result_items = results if isinstance(results, list) else []
    for reaction, result in zip(job.reactions, result_items, strict=False):
        mapped_reaction = _read_optional_string(result, "mapped_rxn")
        confidence = _read_optional_float(result, "confidence")
        warnings = _read_warnings(result)
        center = derive_reaction_center(
            reaction.reaction_id,
            mapped_reaction,
            confidence=confidence,
            min_confidence=min_center_confidence,
        )
        mappings.append(
            AtomMapping(
                reaction_id=reaction.reaction_id,
                provider=provider_key,
                mapped_reaction=mapped_reaction,
                confidence=confidence,
                reaction_center=center,
                warnings=[*warnings, *center.warnings],
            )
        )
    return mappings


def _read_optional_string(payload: Any, key: str) -> str | None:
    value = payload.get(key) if isinstance(payload, dict) else None
    return value.strip() if isinstance(value, str) and value.strip() else None


def _read_optional_float(payload: Any, key: str) -> float | None:
    value = payload.get(key) if isinstance(payload, dict) else None
    return float(value) if isinstance(value, (int, float)) else None


def _read_warnings(payload: Any) -> list[str]:
    warnings = payload.get("warnings") if isinstance(payload, dict) else None
    if not isinstance(warnings, list):
        return []
    return [warning for warning in warnings if isinstance(warning, str) and warning.strip()]
