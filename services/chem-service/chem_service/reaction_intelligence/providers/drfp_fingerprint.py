from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, TypedDict

DEFAULT_DRFP_DIMENSION = 2048
FINGERPRINT_HASH_PREFIX_LENGTH = 16
UNKNOWN_REACTION_ID = "unknown"


class ReactionInput(TypedDict, total=False):
    reaction_id: str
    id: str
    rxn_smiles: str
    reaction_smiles: str
    equation: str


class DrfpFingerprintResult(TypedDict, total=False):
    provider: str
    status: str
    reaction_id: str
    on_bits: list[int]
    fingerprint: list[int]
    fingerprint_ref: str | None
    fingerprint_hash: str | None
    dimension: int
    metadata: dict[str, Any]
    warnings: list[str]


class DrfpEncoder(Protocol):
    @staticmethod
    def encode(reactions: list[str], n_folded_length: int = DEFAULT_DRFP_DIMENSION) -> Any: ...


class DrfpProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class DrfpProviderConfig:
    provider: str = "drfp"
    n_folded_length: int = DEFAULT_DRFP_DIMENSION
    fingerprint_ref_prefix: str = "drfp"


def load_drfp_encoder() -> Any:
    try:
        from drfp import DrfpEncoder as ImportedDrfpEncoder  # type: ignore[import-not-found]
    except Exception as error:
        raise DrfpProviderUnavailable(f"DRFP is not available: {error}") from error
    return ImportedDrfpEncoder


def _stable_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _read_reaction_id(reaction: ReactionInput) -> str:
    reaction_id = reaction.get("reaction_id") or reaction.get("id")
    if not isinstance(reaction_id, str) or not reaction_id.strip():
        raise ValueError("reaction_id is required for DRFP fingerprint")
    return reaction_id.strip()


def _read_reaction_id_or_unknown(reaction: ReactionInput) -> str:
    try:
        return _read_reaction_id(reaction)
    except ValueError:
        return UNKNOWN_REACTION_ID


def _read_reaction_smiles(reaction: ReactionInput) -> str | None:
    for key in ("rxn_smiles", "reaction_smiles", "equation"):
        value = reaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _coerce_on_bits(value: Any) -> tuple[list[int], int]:
    if hasattr(value, "tolist"):
        value = value.tolist()
    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ValueError("DRFP encoder did not return a sequence")

    if all(isinstance(item, bool | int | float) for item in value):
        vector = [int(item) for item in value]
        if all(bit in {0, 1} for bit in vector):
            return [index for index, bit in enumerate(vector) if bit != 0], len(vector)
        return sorted(vector), max(vector, default=-1) + 1
    raise ValueError("DRFP encoder returned a non-numeric fingerprint item")


def _skipped_result(
    reaction: ReactionInput,
    warning: str,
    *,
    config: DrfpProviderConfig,
) -> DrfpFingerprintResult:
    return {
        "provider": config.provider,
        "status": "skipped",
        "reaction_id": _read_reaction_id_or_unknown(reaction),
        "on_bits": [],
        "fingerprint": [],
        "fingerprint_ref": None,
        "fingerprint_hash": None,
        "dimension": 0,
        "metadata": {"reason": "drfp_unavailable"},
        "warnings": [warning],
    }


def _failed_result(
    reaction_id: str,
    warning: str,
    config: DrfpProviderConfig,
) -> DrfpFingerprintResult:
    return {
        "provider": config.provider,
        "status": "failed",
        "reaction_id": reaction_id,
        "on_bits": [],
        "fingerprint": [],
        "fingerprint_ref": None,
        "fingerprint_hash": None,
        "dimension": 0,
        "metadata": {"source": "drfp"},
        "warnings": [warning],
    }


def _ok_result(
    reaction_id: str,
    on_bits: list[int],
    dimension: int,
    config: DrfpProviderConfig,
) -> DrfpFingerprintResult:
    fingerprint_hash = _stable_hash(on_bits)
    fingerprint_ref = (
        f"{config.fingerprint_ref_prefix}::{reaction_id}::"
        f"{fingerprint_hash[:FINGERPRINT_HASH_PREFIX_LENGTH]}"
    )
    return {
        "provider": config.provider,
        "status": "ok",
        "reaction_id": reaction_id,
        "on_bits": on_bits,
        "fingerprint": on_bits,
        "fingerprint_ref": fingerprint_ref,
        "fingerprint_hash": fingerprint_hash,
        "dimension": dimension,
        "metadata": {
            "source": "drfp",
            "n_folded_length": config.n_folded_length,
            "encoding": "on_bits",
        },
        "warnings": [],
    }


class DrfpFingerprintProvider:
    def __init__(
        self,
        *,
        encoder: DrfpEncoder | None = None,
        encoder_loader: Callable[[], Any] = load_drfp_encoder,
        config: DrfpProviderConfig | None = None,
    ) -> None:
        self._encoder = encoder
        self._encoder_loader = encoder_loader
        self._config = config or DrfpProviderConfig()

    def _get_encoder(self) -> Any:
        if self._encoder is None:
            self._encoder = self._encoder_loader()
        return self._encoder

    def fingerprint_reactions(
        self,
        reactions: Iterable[ReactionInput],
    ) -> list[DrfpFingerprintResult]:
        materialized = list(reactions)
        try:
            encoder = self._get_encoder()
        except DrfpProviderUnavailable as error:
            return [
                _skipped_result(reaction, str(error), config=self._config)
                for reaction in materialized
            ]

        results: list[DrfpFingerprintResult] = []
        for reaction in materialized:
            try:
                reaction_id = _read_reaction_id(reaction)
            except ValueError as error:
                reaction_id = _read_reaction_id_or_unknown(reaction)
                results.append(_failed_result(reaction_id, str(error), self._config))
                continue
            reaction_smiles = _read_reaction_smiles(reaction)
            if reaction_smiles is None:
                results.append(
                    _skipped_result(
                        reaction,
                        "DRFP skipped because reaction SMILES is missing.",
                        config=self._config,
                    )
                )
                continue

            try:
                encoded = encoder.encode(
                    [reaction_smiles],
                    n_folded_length=self._config.n_folded_length,
                )
                on_bits, dimension = _coerce_on_bits(encoded[0])
            except (AttributeError, IndexError, TypeError, ValueError) as error:
                results.append(_failed_result(reaction_id, str(error), self._config))
                continue
            results.append(_ok_result(reaction_id, on_bits, dimension, self._config))
        return results


def fingerprint_drfp(
    reactions: Iterable[ReactionInput],
    *,
    encoder: DrfpEncoder | None = None,
    encoder_loader: Callable[[], Any] = load_drfp_encoder,
    config: DrfpProviderConfig | None = None,
) -> list[DrfpFingerprintResult]:
    return DrfpFingerprintProvider(
        encoder=encoder,
        encoder_loader=encoder_loader,
        config=config,
    ).fingerprint_reactions(reactions)
