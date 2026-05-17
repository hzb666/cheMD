from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import json
import math
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import combinations
from typing import Any, Protocol

from chem_cluster_service.intelligence.contracts import (
    ComputedFeature,
    ComputedSimilarityEdge,
    ProviderReport,
    ReactionInput,
)

PROVIDER_ID = "provider::rxnfp"
PROVIDER_KIND = "rxnfp"
EDGE_BASIS = "rxnfp_cosine"
DEFAULT_MODEL_ID = "rxnfp/default-rxnbert"
DEFAULT_DEVICE = "cpu"
DEFAULT_BATCH_SIZE = 32
DEFAULT_TOP_K = 10


@dataclass(frozen=True)
class RxnfpAdapterInspection:
    available: bool
    package_name: str = "rxnfp"
    package_version: str | None = None
    model_id: str = DEFAULT_MODEL_ID
    device: str = DEFAULT_DEVICE
    batch_size: int = DEFAULT_BATCH_SIZE
    warning: str | None = None


class RxnfpEmbeddingAdapter(Protocol):
    def inspect(self) -> RxnfpAdapterInspection: ...
    def embed_reactions(
        self, canonical_rxn_smiles: list[str], batch_size: int
    ) -> list[Sequence[float]]: ...


@dataclass
class RealRxnfpEmbeddingAdapter:
    model_id: str = DEFAULT_MODEL_ID
    device: str = DEFAULT_DEVICE
    batch_size: int = DEFAULT_BATCH_SIZE
    _generator: Any | None = None

    def inspect(self) -> RxnfpAdapterInspection:
        if importlib.util.find_spec("rxnfp") is None:
            return RxnfpAdapterInspection(
                False,
                model_id=self.model_id,
                device=self.device,
                batch_size=self.batch_size,
                warning="dependency_not_installed",
            )
        return RxnfpAdapterInspection(
            True,
            package_version=_package_version("rxnfp") or "unknown",
            model_id=self.model_id,
            device=self.device,
            batch_size=self.batch_size,
        )

    def embed_reactions(
        self, canonical_rxn_smiles: list[str], batch_size: int
    ) -> list[Sequence[float]]:
        generator = self._load_generator()
        if hasattr(generator, "convert_batch"):
            return list(generator.convert_batch(canonical_rxn_smiles))
        return [generator.convert(smiles) for smiles in canonical_rxn_smiles]

    def _load_generator(self) -> Any:
        if self._generator is not None:
            return self._generator
        from rxnfp.transformer_fingerprints import (
            RXNBERTFingerprintGenerator,
            get_default_model_and_tokenizer,
        )

        model, tokenizer = get_default_model_and_tokenizer()
        if self.device and hasattr(model, "to"):
            model = model.to(self.device)
        self._generator = RXNBERTFingerprintGenerator(model, tokenizer)
        return self._generator


@dataclass(frozen=True)
class ProviderResult:
    provider: ProviderReport
    reaction_features: list[ComputedFeature]
    similarity_edges: list[ComputedSimilarityEdge]
    warnings: list[str]


@dataclass(frozen=True)
class _EmbeddingRecord:
    reaction_entity_id: str
    source_hash: str
    embedding: tuple[float, ...]
    warnings: list[str]


class RxnfpProvider:
    provider_id = PROVIDER_ID
    kind = PROVIDER_KIND

    def __init__(
        self,
        *,
        embedding_adapter: RxnfpEmbeddingAdapter | None = None,
        model_id: str = DEFAULT_MODEL_ID,
        device: str = DEFAULT_DEVICE,
        batch_size: int = DEFAULT_BATCH_SIZE,
        top_k: int = DEFAULT_TOP_K,
        storage: str = "sidecar_file",
    ) -> None:
        if batch_size <= 0:
            raise ValueError("batch_size must be positive")
        if top_k <= 0:
            raise ValueError("top_k must be positive")
        if storage not in {"sidecar_file", "inline"}:
            raise ValueError("storage must be sidecar_file or inline")
        self.adapter = embedding_adapter
        self.model_id = model_id
        self.device = device
        self.batch_size = batch_size
        self.top_k = top_k
        self.storage = storage

    def inspect(self) -> ProviderReport:
        inspection = self._adapter().inspect()
        report: ProviderReport = {
            "provider_id": self.provider_id,
            "kind": self.kind,
            "status": "PASS" if inspection.available else "SKIP",
            "package_name": inspection.package_name,
            "model_id": inspection.model_id,
            "warnings": [],
        }
        if inspection.package_version:
            report["package_version"] = inspection.package_version
        if inspection.warning:
            report["warnings"] = [inspection.warning]
        report["device"] = inspection.device
        report["batch_size"] = inspection.batch_size
        return report

    def run(self, reactions: list[ReactionInput]) -> ProviderResult:
        provider = self.inspect()
        if provider["status"] == "SKIP":
            return ProviderResult(provider, [], [], list(provider.get("warnings", [])))
        features, records, warnings = self._embed_reactions(reactions, str(provider["model_id"]))
        mismatch = _dimension_mismatch(records)
        if mismatch:
            warnings.append(mismatch)
            provider["status"] = "ERROR"
        if not records:
            warnings.append("rxnfp_no_valid_embeddings")
        provider["warnings"] = list(dict.fromkeys(list(provider.get("warnings", [])) + warnings))
        edges = [] if provider["status"] == "ERROR" else self._similarity_edges(records)
        return ProviderResult(provider, features, edges, list(provider["warnings"]))

    def _adapter(self) -> RxnfpEmbeddingAdapter:
        return self.adapter or RealRxnfpEmbeddingAdapter(
            model_id=self.model_id,
            device=self.device,
            batch_size=self.batch_size,
        )

    def _embed_reactions(
        self,
        reactions: list[ReactionInput],
        model_id: str,
    ) -> tuple[list[ComputedFeature], list[_EmbeddingRecord], list[str]]:
        try:
            embeddings = self._adapter().embed_reactions(
                [item.get("canonical_rxn_smiles", "") for item in reactions],
                self.batch_size,
            )
        except Exception as exc:  # noqa: BLE001 - provider boundary converts failures.
            warning = f"rxnfp_batch_failed:{type(exc).__name__}"
            return [_feature(reaction, [], [warning]) for reaction in reactions], [], [warning]
        features: list[ComputedFeature] = []
        records: list[_EmbeddingRecord] = []
        warnings = (
            ["rxnfp_batch_result_count_mismatch"] if len(embeddings) != len(reactions) else []
        )
        for reaction, raw_embedding in zip(reactions, embeddings, strict=False):
            feature, record = self._feature_for_embedding(reaction, raw_embedding, model_id)
            features.append(feature)
            if record is not None:
                records.append(record)
        missing = reactions[len(embeddings) :]
        features.extend(_feature(reaction, [], ["rxnfp_missing_embedding"]) for reaction in missing)
        return features, records, warnings

    def _feature_for_embedding(
        self,
        reaction: ReactionInput,
        raw_embedding: Sequence[float],
        model_id: str,
    ) -> tuple[ComputedFeature, _EmbeddingRecord | None]:
        embedding = _to_float_tuple(raw_embedding)
        if not embedding:
            return _feature(reaction, [], ["rxnfp_empty_embedding"]), None

        embedding_hash = _embedding_hash(embedding, model_id)
        feature_ref: dict[str, Any] = {
            "feature_ref_id": (
                f"feature-ref::{reaction.get('reaction_entity_id', '')}::rxnfp::"
                f"{embedding_hash[7:19]}"
            ),
            "provider": "rxnfp",
            "kind": "float_embedding",
            "dimension": len(embedding),
            "storage": self.storage,
            "hash": embedding_hash,
            "model_id": model_id,
            "warnings": [],
        }
        if self.storage == "inline":
            feature_ref["embedding"] = list(embedding)
        else:
            feature_ref["sidecar_key"] = f"rxnfp/{embedding_hash[7:19]}.json"
        record = _EmbeddingRecord(
            reaction_entity_id=reaction.get("reaction_entity_id", ""),
            source_hash=reaction.get("source_hash", ""),
            embedding=embedding,
            warnings=[],
        )
        return _feature(reaction, [feature_ref], []), record

    def _similarity_edges(self, records: list[_EmbeddingRecord]) -> list[ComputedSimilarityEdge]:
        edges = [
            _edge(left, right, _cosine(left.embedding, right.embedding))
            for left, right in combinations(records, 2)
        ]
        edges = [edge for edge in edges if edge["score"] > 0.0]
        edges.sort(key=lambda item: item["score"], reverse=True)
        return edges[: self.top_k]


def run_rxnfp_provider(
    reactions: list[ReactionInput],
    *,
    embedding_adapter: RxnfpEmbeddingAdapter | None = None,
    model_id: str = DEFAULT_MODEL_ID,
    device: str = DEFAULT_DEVICE,
    batch_size: int = DEFAULT_BATCH_SIZE,
    top_k: int = DEFAULT_TOP_K,
    storage: str = "sidecar_file",
) -> ProviderResult:
    return RxnfpProvider(
        embedding_adapter=embedding_adapter,
        model_id=model_id,
        device=device,
        batch_size=batch_size,
        top_k=top_k,
        storage=storage,
    ).run(reactions)


def _feature(
    reaction: ReactionInput, refs: list[dict[str, Any]], warnings: list[str]
) -> ComputedFeature:
    return {
        "reaction_entity_id": reaction.get("reaction_entity_id", ""),
        "source_hash": reaction.get("source_hash", ""),
        "canonical_rxn_smiles": reaction.get("canonical_rxn_smiles", ""),
        "fingerprint_refs": refs,
        "warnings": warnings,
    }


def _edge(left: _EmbeddingRecord, right: _EmbeddingRecord, score: float) -> ComputedSimilarityEdge:
    pair_warnings = left.warnings + right.warnings
    edge_id = f"computed-edge::{left.reaction_entity_id}::{right.reaction_entity_id}::rxnfp-cosine"
    return {
        "edge_id": edge_id,
        "from_reaction_entity_id": left.reaction_entity_id,
        "to_reaction_entity_id": right.reaction_entity_id,
        "score": round(score, 6),
        "confidence": _confidence_for_score(score, pair_warnings),
        "basis": [EDGE_BASIS],
        "provider_ids": [PROVIDER_ID],
        "source_hashes": [left.source_hash, right.source_hash],
        "warnings": pair_warnings,
    }


def _to_float_tuple(value: Sequence[float]) -> tuple[float, ...]:
    try:
        embedding = tuple(float(item) for item in value)
    except (TypeError, ValueError):
        return ()
    return embedding if embedding and all(math.isfinite(item) for item in embedding) else ()


def _dimension_mismatch(records: list[_EmbeddingRecord]) -> str | None:
    dimensions = {len(record.embedding) for record in records}
    if len(dimensions) <= 1:
        return None
    return "rxnfp_embedding_dimension_mismatch:" + ",".join(map(str, sorted(dimensions)))


def _cosine(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    numerator = sum(
        left_item * right_item for left_item, right_item in zip(left, right, strict=False)
    )
    left_norm = math.sqrt(sum(item * item for item in left))
    right_norm = math.sqrt(sum(item * item for item in right))
    return 0.0 if left_norm == 0.0 or right_norm == 0.0 else numerator / (left_norm * right_norm)


def _embedding_hash(embedding: tuple[float, ...], model_id: str) -> str:
    payload = json.dumps(
        {"embedding": list(embedding), "dimension": len(embedding), "model_id": model_id},
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _confidence_for_score(score: float, warnings: list[str]) -> str:
    if warnings:
        return "low"
    if score >= 0.9:
        return "high"
    return "medium" if score >= 0.7 else "low"


def _package_version(package_name: str) -> str | None:
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None
