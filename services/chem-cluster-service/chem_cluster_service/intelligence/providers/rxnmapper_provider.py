from __future__ import annotations

import hashlib
import importlib.metadata
import importlib.util
import json
from dataclasses import dataclass
from typing import Any, Protocol

from chem_cluster_service.intelligence.contracts import ReactionInput
from chem_cluster_service.intelligence.reaction_center import (
    build_reaction_center_similarity_edges,
    derive_reaction_center,
)

PROVIDER_ID = "provider::rxnmapper"
LOW_CONFIDENCE_THRESHOLD = 0.65


class MapperAdapter(Protocol):
    def map_reactions(self, reaction_smiles: list[str]) -> list[Any]: ...


@dataclass(frozen=True)
class ProviderResult:
    provider: dict[str, Any]
    reaction_features: list[dict[str, Any]]
    similarity_edges: list[dict[str, Any]]
    warnings: list[str]


class RXNMapperAdapter:
    def __init__(self, batch_size: int = 32) -> None:
        self.batch_size = batch_size
        self._mapper: Any | None = None

    def map_reactions(self, reaction_smiles: list[str]) -> list[Any]:
        mapper = self._load_mapper()
        if hasattr(mapper, "map_reactions_with_info"):
            return mapper.map_reactions_with_info(reaction_smiles, detailed=True)
        return mapper.get_attention_guided_atom_maps(reaction_smiles, detailed_output=True)

    def _load_mapper(self) -> Any:
        if self._mapper is not None:
            return self._mapper
        from rxnmapper import BatchedMapper, RXNMapper

        try:
            self._mapper = BatchedMapper(batch_size=self.batch_size)
        except TypeError:
            try:
                self._mapper = BatchedMapper()
            except TypeError:
                self._mapper = RXNMapper()
        return self._mapper


class RXNMapperProvider:
    provider_id = PROVIDER_ID
    kind = "rxnmapper"

    def __init__(
        self,
        *,
        mapper_adapter: MapperAdapter | None = None,
        batch_size: int = 32,
        low_confidence_threshold: float = LOW_CONFIDENCE_THRESHOLD,
    ) -> None:
        self.mapper_adapter = mapper_adapter
        self.batch_size = batch_size
        self.low_confidence_threshold = low_confidence_threshold

    def inspect(self) -> dict[str, Any]:
        package_version = _package_version("rxnmapper")
        if self.mapper_adapter is not None:
            return {
                "provider_id": self.provider_id,
                "kind": self.kind,
                "status": "PASS",
                "package_name": "rxnmapper",
                "package_version": package_version or "injected-adapter",
                "warnings": [],
            }
        if importlib.util.find_spec("rxnmapper") is None:
            return {
                "provider_id": self.provider_id,
                "kind": self.kind,
                "status": "SKIP",
                "package_name": "rxnmapper",
                "warnings": ["dependency_not_installed"],
            }
        return {
            "provider_id": self.provider_id,
            "kind": self.kind,
            "status": "PASS",
            "package_name": "rxnmapper",
            "package_version": package_version or "unknown",
            "warnings": [],
        }

    def run(self, reactions: list[ReactionInput]) -> ProviderResult:
        provider = self.inspect()
        if provider["status"] == "SKIP":
            return ProviderResult(
                provider=provider,
                reaction_features=[],
                similarity_edges=[],
                warnings=list(provider["warnings"]),
            )

        adapter = self.mapper_adapter or RXNMapperAdapter(batch_size=self.batch_size)
        mapped_by_index, mapping_warnings = self._map_with_isolation(adapter, reactions)
        features: list[dict[str, Any]] = []

        for index, reaction in enumerate(reactions):
            reaction_warnings = list(mapping_warnings.get(index, []))
            mapping = mapped_by_index.get(index)
            if mapping is None:
                reaction_warnings.append("rxnmapper_empty_result")
                features.append(_feature(reaction, warnings=reaction_warnings))
                continue
            if not mapping:
                reaction_warnings.append("rxnmapper_empty_result")
                features.append(_feature(reaction, warnings=reaction_warnings))
                continue

            mapped_rxn = _mapped_rxn(mapping)
            confidence = _confidence(mapping)
            if not mapped_rxn:
                reaction_warnings.append("rxnmapper_empty_mapped_rxn")
                features.append(_feature(reaction, warnings=reaction_warnings))
                continue
            if confidence is None:
                reaction_warnings.append("rxnmapper_confidence_missing")
            elif confidence < self.low_confidence_threshold:
                reaction_warnings.append("rxnmapper_low_confidence")

            atom_mapping = {
                "provider": "rxnmapper",
                "mapped_rxn": mapped_rxn,
                "confidence": confidence if confidence is not None else 0.0,
                "mapping_hash": _mapping_hash(mapped_rxn, confidence),
                "warnings": list(reaction_warnings),
            }
            reaction_center = derive_reaction_center(
                mapped_rxn,
                confidence,
                low_confidence_threshold=self.low_confidence_threshold,
            )
            features.append(
                _feature(
                    reaction,
                    atom_mapping=atom_mapping,
                    reaction_center=reaction_center,
                    warnings=reaction_warnings + list(reaction_center["warnings"]),
                )
            )

        return ProviderResult(
            provider=provider,
            reaction_features=features,
            similarity_edges=build_reaction_center_similarity_edges(
                features, provider_id=PROVIDER_ID
            ),
            warnings=[],
        )

    def _map_with_isolation(
        self,
        adapter: MapperAdapter,
        reactions: list[ReactionInput],
    ) -> tuple[dict[int, Any], dict[int, list[str]]]:
        mapped: dict[int, Any] = {}
        warnings: dict[int, list[str]] = {}
        for start in range(0, len(reactions), self.batch_size):
            indexed = list(enumerate(reactions[start : start + self.batch_size], start=start))
            smiles = [item["canonical_rxn_smiles"] for _, item in indexed]
            try:
                batch_results = _normalize_results(adapter.map_reactions(smiles))
                for (index, _), result in zip(indexed, batch_results, strict=False):
                    mapped[index] = result
                if len(batch_results) < len(indexed):
                    for index, _ in indexed[len(batch_results) :]:
                        warnings.setdefault(index, []).append("rxnmapper_missing_batch_result")
                continue
            except Exception as exc:  # noqa: BLE001 - provider boundary converts failures to warnings.
                batch_warning = f"rxnmapper_batch_failed:{type(exc).__name__}"

            for index, reaction in indexed:
                try:
                    result = _normalize_results(
                        adapter.map_reactions([reaction["canonical_rxn_smiles"]])
                    )
                except Exception as exc:  # noqa: BLE001 - one reaction must not fail the batch.
                    warnings.setdefault(index, []).append(
                        f"rxnmapper_reaction_failed:{type(exc).__name__}"
                    )
                    continue
                if result:
                    mapped[index] = result[0]
                    warnings.setdefault(index, []).append(batch_warning)
                else:
                    warnings.setdefault(index, []).extend([batch_warning, "rxnmapper_empty_result"])
        return mapped, warnings


def _normalize_results(results: Any) -> list[Any]:
    if results is None:
        return []
    if isinstance(results, list):
        return results
    return list(results)


def _mapped_rxn(mapping: Any) -> str | None:
    if isinstance(mapping, dict):
        value = mapping.get("mapped_rxn") or mapping.get("mapped_reaction_smiles")
        return value if isinstance(value, str) and value else None
    value = getattr(mapping, "mapped_rxn", None)
    return value if isinstance(value, str) and value else None


def _confidence(mapping: Any) -> float | None:
    value = (
        mapping.get("confidence")
        if isinstance(mapping, dict)
        else getattr(mapping, "confidence", None)
    )
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _feature(
    reaction: ReactionInput,
    *,
    atom_mapping: dict[str, Any] | None = None,
    reaction_center: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    feature: dict[str, Any] = {
        "reaction_entity_id": reaction["reaction_entity_id"],
        "source_hash": reaction["source_hash"],
        "canonical_rxn_smiles": reaction["canonical_rxn_smiles"],
        "fingerprint_refs": [],
        "warnings": warnings or [],
    }
    if atom_mapping is not None:
        feature["atom_mapping"] = atom_mapping
    if reaction_center is not None:
        feature["reaction_center"] = reaction_center
    return feature


def _mapping_hash(mapped_rxn: str, confidence: float | None) -> str:
    payload = json.dumps(
        {"mapped_rxn": mapped_rxn, "confidence": confidence},
        sort_keys=True,
        separators=(",", ":"),
    )
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _package_version(package_name: str) -> str | None:
    try:
        return importlib.metadata.version(package_name)
    except importlib.metadata.PackageNotFoundError:
        return None
