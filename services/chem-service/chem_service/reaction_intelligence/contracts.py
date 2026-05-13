from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal

ProviderStatusValue = Literal["ok", "skipped", "failed"]


@dataclass(frozen=True, slots=True)
class ReactionIntelligenceReaction:
    reaction_id: str
    reaction_smiles: str
    reactants: list[str] = field(default_factory=list)
    products: list[str] = field(default_factory=list)
    conditions: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ReactionIntelligenceJob:
    job_id: str
    reactions: list[ReactionIntelligenceReaction]
    provider_options: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ProviderStatus:
    provider: str
    status: ProviderStatusValue
    warnings: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ReactionFingerprint:
    reaction_id: str
    provider: str
    fingerprint_kind: str
    on_bits: list[int]
    bit_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ReactionCenter:
    reaction_id: str
    status: ProviderStatusValue
    signature: str | None
    changed_atom_maps: list[int] = field(default_factory=list)
    confidence: float | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class AtomMapping:
    reaction_id: str
    provider: str
    mapped_reaction: str | None
    confidence: float | None
    reaction_center: ReactionCenter | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ReactionIntelligenceArtifact:
    schema_version: str
    job_id: str
    provider_statuses: list[ProviderStatus] = field(default_factory=list)
    fingerprints: list[ReactionFingerprint] = field(default_factory=list)
    atom_mappings: list[AtomMapping] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
