from __future__ import annotations

import importlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from chem_service.reaction_intelligence.contracts import (
    ProviderStatus,
    ReactionFingerprint,
    ReactionIntelligenceArtifact,
    ReactionIntelligenceJob,
)
from chem_service.reaction_intelligence.providers.base import (
    REACTION_INTELLIGENCE_SCHEMA_VERSION,
    provider_skipped,
)

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RdkitReactionToolkit:
    reactions_module: Any


def load_rdkit_reaction_toolkit() -> RdkitReactionToolkit | None:
    try:
        reactions_module = importlib.import_module("rdkit.Chem.rdChemReactions")
    except Exception as error:
        LOGGER.info("RDKit reaction fingerprint provider skipped: %s", error)
        return None
    return RdkitReactionToolkit(reactions_module=reactions_module)


class RdkitReactionFingerprintProvider:
    provider_key = "rdkit-fingerprint"
    fingerprint_kind = "rdkit-structural-reaction-fingerprint"

    def __init__(
        self,
        *,
        toolkit_loader: Callable[[], RdkitReactionToolkit | None] = load_rdkit_reaction_toolkit,
    ) -> None:
        self._toolkit_loader = toolkit_loader

    def run(self, job: ReactionIntelligenceJob) -> ReactionIntelligenceArtifact:
        toolkit = self._toolkit_loader()
        if toolkit is None:
            return provider_skipped(self.provider_key, job.job_id, "RDKit is not available.")

        fingerprints: list[ReactionFingerprint] = []
        warnings: list[str] = []
        for reaction in job.reactions:
            fingerprint = _build_fingerprint(reaction.reaction_smiles, toolkit.reactions_module)
            if fingerprint is None:
                warnings.append(f"RDKit fingerprint skipped for reaction {reaction.reaction_id}.")
                continue
            fingerprints.append(
                ReactionFingerprint(
                    reaction_id=reaction.reaction_id,
                    provider=self.provider_key,
                    fingerprint_kind=self.fingerprint_kind,
                    on_bits=fingerprint["on_bits"],
                    bit_count=len(fingerprint["on_bits"]),
                    metadata=fingerprint["metadata"],
                )
            )

        status = "ok" if fingerprints else "skipped"
        return ReactionIntelligenceArtifact(
            schema_version=REACTION_INTELLIGENCE_SCHEMA_VERSION,
            job_id=job.job_id,
            provider_statuses=[
                ProviderStatus(
                    provider=self.provider_key,
                    status=status,
                    warnings=warnings,
                    details={"fingerprintCount": len(fingerprints)},
                )
            ],
            fingerprints=fingerprints,
            warnings=warnings,
        )


def _build_fingerprint(reaction_smiles: str, reactions_module: Any) -> dict[str, Any] | None:
    try:
        reaction = _build_rdkit_reaction(reaction_smiles, reactions_module)
        if reaction is None:
            return None
        bit_vector = reactions_module.CreateStructuralFingerprintForReaction(reaction)
        on_bits = _read_on_bits(bit_vector)
    except (AttributeError, TypeError, ValueError, RuntimeError) as error:
        LOGGER.warning("RDKit reaction fingerprint failed: %s", error)
        return None

    return {
        "on_bits": on_bits,
        "metadata": {
            "sourceReactionSmiles": reaction_smiles,
            "numBits": _read_num_bits(bit_vector),
            "onBitCount": len(on_bits),
        },
    }


def _build_rdkit_reaction(reaction_smiles: str, reactions_module: Any) -> Any | None:
    if hasattr(reactions_module, "ReactionFromSmiles"):
        return reactions_module.ReactionFromSmiles(reaction_smiles)
    return reactions_module.ReactionFromSmarts(reaction_smiles, useSmiles=True)


def _read_on_bits(bit_vector: Any) -> list[int]:
    if hasattr(bit_vector, "GetOnBits"):
        return sorted(int(bit) for bit in bit_vector.GetOnBits())
    if hasattr(bit_vector, "GetNonzeroElements"):
        return sorted(int(bit) for bit in bit_vector.GetNonzeroElements().keys())
    return []


def _read_num_bits(bit_vector: Any) -> int | None:
    if hasattr(bit_vector, "GetNumBits"):
        return int(bit_vector.GetNumBits())
    return None
