from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal


@dataclass(frozen=True, slots=True)
class BaseStructureSaveRequest:
    document_id: str
    block_id: str
    session_id: str
    source: str
    confidence: float | None = None
    provider: str | None = None
    fingerprint: str | None = None
    normalized: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class MoleculeStructureSaveRequest(BaseStructureSaveRequest):
    kind: Literal["molecule"] = "molecule"
    smiles: str = ""
    molfile: str | None = None


@dataclass(frozen=True, slots=True)
class ReactionStructureSaveRequest(BaseStructureSaveRequest):
    kind: Literal["reaction"] = "reaction"
    reactants: list[str] | None = None
    products: list[str] | None = None
    conditions: list[str] | None = None
    reaction_smiles: str | None = None
    rxnfile: str | None = None


StructureSaveRequest = MoleculeStructureSaveRequest | ReactionStructureSaveRequest
