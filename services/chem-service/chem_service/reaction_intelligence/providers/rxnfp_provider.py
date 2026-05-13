from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol, TypedDict


class ReactionInput(TypedDict, total=False):
    reaction_id: str
    id: str
    rxn_smiles: str
    reaction_smiles: str
    equation: str


class RxnfpEmbeddingResult(TypedDict, total=False):
    provider: str
    status: str
    reaction_id: str
    embedding: list[float]
    metadata: dict[str, Any]
    vector_ref: str | None
    vector_hash: str | None
    dimension: int
    warnings: list[str]


class RxnfpGenerator(Protocol):
    def convert(self, reaction_smiles: str) -> Any: ...


class RxnfpProviderUnavailable(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class RxnfpProviderConfig:
    provider: str = "rxnfp"
    model_name: str = "rxnfp-default"
    vector_ref_prefix: str = "rxnfp"


def _stable_json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _coerce_vector(value: Any) -> list[float]:
    if hasattr(value, "tolist"):
        value = value.tolist()

    if isinstance(value, list) and value and isinstance(value[0], list):
        value = value[0]

    if not isinstance(value, Sequence) or isinstance(value, str):
        raise ValueError("RXNFP generator did not return a numeric sequence")

    vector: list[float] = []
    for item in value:
        if not isinstance(item, int | float):
            raise ValueError("RXNFP generator returned a non-numeric vector item")
        vector.append(float(item))
    return vector


def _read_reaction_id(reaction: ReactionInput) -> str:
    reaction_id = reaction.get("reaction_id") or reaction.get("id")
    if not isinstance(reaction_id, str) or not reaction_id.strip():
        raise ValueError("reaction_id is required for RXNFP embedding")
    return reaction_id.strip()


def _read_reaction_smiles(reaction: ReactionInput) -> str | None:
    for key in ("rxn_smiles", "reaction_smiles", "equation"):
        value = reaction.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _load_default_generator() -> Any:
    try:
        from rxnfp.transformer_fingerprints import (  # type: ignore[import-not-found]
            RXNBERTFingerprintGenerator,
            get_default_model_and_tokenizer,
        )
    except Exception as error:  # pragma: no cover - exercised through the public skip path.
        raise RxnfpProviderUnavailable(f"RXNFP is not available: {error}") from error

    try:
        model, tokenizer = get_default_model_and_tokenizer()
        return RXNBERTFingerprintGenerator(model, tokenizer)
    except Exception as error:  # pragma: no cover - depends on local model/runtime state.
        raise RxnfpProviderUnavailable(f"RXNFP generator failed to initialize: {error}") from error


def _run_generator(generator: Any, reaction_smiles: str) -> list[float]:
    if hasattr(generator, "convert"):
        return _coerce_vector(generator.convert(reaction_smiles))
    if hasattr(generator, "encode"):
        return _coerce_vector(generator.encode(reaction_smiles))
    if isinstance(generator, Callable):
        return _coerce_vector(generator(reaction_smiles))
    raise ValueError("RXNFP generator must expose convert(), encode(), or be callable")


def _skipped_result(
    reaction: ReactionInput,
    warning: str,
    *,
    provider: str,
) -> RxnfpEmbeddingResult:
    return {
        "provider": provider,
        "status": "skipped",
        "reaction_id": _read_reaction_id(reaction),
        "metadata": {"reason": "rxnfp_unavailable"},
        "vector_ref": None,
        "vector_hash": None,
        "dimension": 0,
        "warnings": [warning],
    }


class RxnfpProvider:
    def __init__(
        self,
        *,
        generator: Any | None = None,
        generator_factory: Callable[[], Any] | None = None,
        config: RxnfpProviderConfig | None = None,
    ) -> None:
        self._generator = generator
        self._generator_factory = generator_factory or _load_default_generator
        self._config = config or RxnfpProviderConfig()

    def _get_generator(self) -> Any:
        if self._generator is None:
            self._generator = self._generator_factory()
        return self._generator

    def embed_reactions(self, reactions: Iterable[ReactionInput]) -> list[RxnfpEmbeddingResult]:
        materialized = list(reactions)
        try:
            generator = self._get_generator()
        except RxnfpProviderUnavailable as error:
            return [
                _skipped_result(reaction, str(error), provider=self._config.provider)
                for reaction in materialized
            ]

        results: list[RxnfpEmbeddingResult] = []
        for reaction in materialized:
            reaction_id = _read_reaction_id(reaction)
            reaction_smiles = _read_reaction_smiles(reaction)
            if reaction_smiles is None:
                results.append(
                    {
                        "provider": self._config.provider,
                        "status": "skipped",
                        "reaction_id": reaction_id,
                        "metadata": {"reason": "missing_reaction_smiles"},
                        "vector_ref": None,
                        "vector_hash": None,
                        "dimension": 0,
                        "warnings": ["RXNFP skipped because reaction SMILES is missing."],
                    }
                )
                continue

            try:
                vector = _run_generator(generator, reaction_smiles)
            except ValueError as error:
                results.append(
                    {
                        "provider": self._config.provider,
                        "status": "failed",
                        "reaction_id": reaction_id,
                        "metadata": {"model": self._config.model_name},
                        "vector_ref": None,
                        "vector_hash": None,
                        "dimension": 0,
                        "warnings": [str(error)],
                    }
                )
                continue

            vector_hash = _stable_json_hash(vector)
            vector_ref = f"{self._config.vector_ref_prefix}::{reaction_id}::{vector_hash[:16]}"
            results.append(
                {
                    "provider": self._config.provider,
                    "status": "ok",
                    "reaction_id": reaction_id,
                    "embedding": vector,
                    "metadata": {
                        "model": self._config.model_name,
                        "source": "rxnfp_embedding",
                    },
                    "vector_ref": vector_ref,
                    "vector_hash": vector_hash,
                    "dimension": len(vector),
                    "warnings": [],
                }
            )

        return results


def embed_rxnfp(
    reactions: Iterable[ReactionInput],
    *,
    generator: Any | None = None,
    generator_factory: Callable[[], Any] | None = None,
    config: RxnfpProviderConfig | None = None,
) -> list[RxnfpEmbeddingResult]:
    return RxnfpProvider(
        generator=generator,
        generator_factory=generator_factory,
        config=config,
    ).embed_reactions(reactions)
