from __future__ import annotations

import hashlib
import importlib
import json
from dataclasses import dataclass
from itertools import combinations
from typing import Protocol

from chem_cluster_service.intelligence.contracts import (
    ComputedFeature,
    ComputedSimilarityEdge,
    ProviderReport,
    ReactionInput,
)

PROVIDER_ID = "provider::rdkit-fingerprint"
PROVIDER_KIND = "rdkit_fingerprint"
EDGE_BASIS = "rdkit_fingerprint_tanimoto"
FINGERPRINT_ALGORITHM = "rdkit_reaction_directional_8192_v3"
DEFAULT_COMPONENT_DIMENSION = 1024
DEFAULT_SIDE_DIMENSION = DEFAULT_COMPONENT_DIMENSION * 2
DEFAULT_DIMENSION = DEFAULT_SIDE_DIMENSION * 4
BLOCK_WEIGHTS = {
    "reactant": 0.20,
    "product": 0.20,
    "gained": 0.30,
    "lost": 0.30,
}


class ReactionFingerprintError(ValueError):
    """Raised when a single reaction cannot produce a fingerprint."""


@dataclass(frozen=True)
class RdkitAdapterInspection:
    available: bool
    package_name: str = "rdkit"
    package_version: str | None = None
    warning: str | None = None


class RdkitFingerprintAdapter(Protocol):
    def inspect(self) -> RdkitAdapterInspection: ...

    def fingerprint_reaction(
        self,
        canonical_rxn_smiles: str,
        path_dimension: int,
        morgan_dimension: int,
    ) -> "ReactionFingerprint": ...


class RealRdkitFingerprintAdapter:
    def __init__(self) -> None:
        self._chem = None
        self._all_chem = None
        self._version: str | None = None

    def inspect(self) -> RdkitAdapterInspection:
        try:
            self._load()
        except ImportError:
            return RdkitAdapterInspection(
                available=False,
                warning="dependency_not_installed",
            )
        return RdkitAdapterInspection(
            available=True,
            package_version=self._version,
        )

    def fingerprint_reaction(
        self,
        canonical_rxn_smiles: str,
        path_dimension: int,
        morgan_dimension: int,
    ) -> "ReactionFingerprint":
        self._load()
        if not canonical_rxn_smiles or ">>" not in canonical_rxn_smiles:
            raise ReactionFingerprintError("reaction_smiles_missing_arrow")

        left, right = canonical_rxn_smiles.split(">>", 1)
        if not left or not right:
            raise ReactionFingerprintError("reaction_smiles_missing_side")
        reactant_bits = self._side_fingerprint(left, path_dimension, morgan_dimension)
        product_bits = self._side_fingerprint(right, path_dimension, morgan_dimension)
        if not reactant_bits and not product_bits:
            raise ReactionFingerprintError("reaction_smiles_has_no_molecules")
        return ReactionFingerprint.from_side_bits(
            reactant_bits,
            product_bits,
            side_dimension=path_dimension + morgan_dimension,
        )

    def _load(self) -> None:
        if self._chem is not None and self._all_chem is not None:
            return
        try:
            self._chem = importlib.import_module("rdkit.Chem")
            self._all_chem = importlib.import_module("rdkit.Chem.AllChem")
            rd_base = importlib.import_module("rdkit.rdBase")
        except ImportError as exc:
            raise ImportError("rdkit is not importable") from exc
        self._version = getattr(rd_base, "rdkitVersion", None)

    def _side_fingerprint(
        self,
        side_smiles: str,
        path_dimension: int,
        morgan_dimension: int,
    ) -> set[int]:
        assert self._chem is not None
        assert self._all_chem is not None
        bits: set[int] = set()
        for molecule_smiles in [item for item in side_smiles.split(".") if item]:
            molecule = self._chem.MolFromSmiles(molecule_smiles)
            if molecule is None:
                raise ReactionFingerprintError("reaction_smiles_contains_invalid_molecule")
            path_fingerprint = self._chem.RDKFingerprint(
                molecule,
                fpSize=path_dimension,
            )
            morgan_fingerprint = self._all_chem.GetMorganFingerprintAsBitVect(
                molecule,
                2,
                nBits=morgan_dimension,
            )
            bits.update(int(bit) for bit in path_fingerprint.GetOnBits())
            bits.update(
                path_dimension + int(bit)
                for bit in morgan_fingerprint.GetOnBits()
            )
        return bits


class RdkitFingerprintProvider:
    def __init__(
        self,
        adapter: RdkitFingerprintAdapter | None = None,
        *,
        path_dimension: int = DEFAULT_COMPONENT_DIMENSION,
        morgan_dimension: int = DEFAULT_COMPONENT_DIMENSION,
        similarity_threshold: float = 0.0,
    ) -> None:
        if path_dimension <= 0:
            raise ValueError("path_dimension must be positive")
        if morgan_dimension <= 0:
            raise ValueError("morgan_dimension must be positive")
        if similarity_threshold < 0.0 or similarity_threshold > 1.0:
            raise ValueError("similarity_threshold must be between 0 and 1")
        self.adapter = adapter or RealRdkitFingerprintAdapter()
        self.path_dimension = path_dimension
        self.morgan_dimension = morgan_dimension
        self.side_dimension = path_dimension + morgan_dimension
        self.dimension = self.side_dimension * 4
        self.similarity_threshold = similarity_threshold

    def inspect(self) -> ProviderReport:
        inspection = self.adapter.inspect()
        report: ProviderReport = {
            "provider_id": PROVIDER_ID,
            "kind": PROVIDER_KIND,
            "status": "PASS" if inspection.available else "SKIP",
            "package_name": inspection.package_name,
            "warnings": [],
        }
        if inspection.package_version:
            report["package_version"] = inspection.package_version
        if inspection.warning:
            report["warnings"] = [inspection.warning]
        return report

    def run(self, reactions: list[ReactionInput]) -> dict[str, object]:
        provider = self.inspect()
        if provider["status"] == "SKIP":
            return {
                "provider": provider,
                "reaction_features": [],
                "similarity_edges": [],
                "warnings": list(provider.get("warnings", [])),
            }

        feature_records: list[_FingerprintFeatureRecord] = []
        reaction_features: list[ComputedFeature] = []
        for reaction in reactions:
            feature, record = self._feature_for_reaction(reaction)
            reaction_features.append(feature)
            if record is not None:
                feature_records.append(record)

        similarity_edges = self._similarity_edges(feature_records)
        warnings = _provider_warnings(provider, reaction_features)
        provider["warnings"] = warnings
        return {
            "provider": provider,
            "reaction_features": reaction_features,
            "similarity_edges": similarity_edges,
            "warnings": warnings,
        }

    def _feature_for_reaction(
        self,
        reaction: ReactionInput,
    ) -> tuple[ComputedFeature, _FingerprintFeatureRecord | None]:
        reaction_id = reaction.get("reaction_entity_id", "")
        source_hash = reaction.get("source_hash", "")
        canonical_rxn_smiles = reaction.get("canonical_rxn_smiles", "")
        warnings: list[str] = []
        feature: ComputedFeature = {
            "reaction_entity_id": reaction_id,
            "source_hash": source_hash,
            "canonical_rxn_smiles": canonical_rxn_smiles,
            "fingerprint_refs": [],
            "warnings": warnings,
        }

        try:
            fingerprint = self.adapter.fingerprint_reaction(
                canonical_rxn_smiles,
                self.path_dimension,
                self.morgan_dimension,
            )
        except ReactionFingerprintError as exc:
            warnings.append(f"rdkit_fingerprint_invalid_reaction:{exc}")
            return feature, None
        except Exception as exc:
            warnings.append(f"rdkit_fingerprint_failed:{type(exc).__name__}")
            return feature, None

        if not fingerprint.bits:
            warnings.append("rdkit_fingerprint_empty")

        feature["fingerprint_refs"] = [self._feature_ref(reaction_id, fingerprint)]
        record = _FingerprintFeatureRecord(
            reaction_entity_id=reaction_id,
            source_hash=source_hash,
            fingerprint=fingerprint,
            warnings=list(warnings),
        )
        return feature, record

    def _feature_ref(self, reaction_id: str, fingerprint: "ReactionFingerprint") -> dict[str, object]:
        fingerprint_hash = _fingerprint_hash(self.dimension, fingerprint.bits)
        return {
            "feature_ref_id": f"feature-ref::{reaction_id}::rdkit::{fingerprint_hash[7:19]}",
            "provider": "rdkit",
            "kind": "bit_vector",
            "algorithm": FINGERPRINT_ALGORITHM,
            "dimension": self.dimension,
            "storage": "inline",
            "hash": fingerprint_hash,
            "bit_indices": sorted(fingerprint.bits),
            "block_dimensions": {
                "path": self.path_dimension,
                "morgan": self.morgan_dimension,
                "side": self.side_dimension,
                "reactant": self.side_dimension,
                "product": self.side_dimension,
                "gained": self.side_dimension,
                "lost": self.side_dimension,
            },
            "block_offsets": {
                "reactant": 0,
                "product": self.side_dimension,
                "gained": self.side_dimension * 2,
                "lost": self.side_dimension * 3,
            },
            "block_bit_indices": {
                "reactant": sorted(fingerprint.reactant_bits),
                "product": sorted(fingerprint.product_bits),
                "gained": sorted(fingerprint.gained_bits),
                "lost": sorted(fingerprint.lost_bits),
            },
            "block_weights": BLOCK_WEIGHTS,
        }

    def _similarity_edges(
        self,
        features: list[_FingerprintFeatureRecord],
    ) -> list[ComputedSimilarityEdge]:
        edges: list[ComputedSimilarityEdge] = []
        for left, right in combinations(features, 2):
            score, contributions = _reaction_fingerprint_similarity(
                left.fingerprint,
                right.fingerprint,
            )
            if score <= self.similarity_threshold:
                continue
            pair_warnings = left.warnings + right.warnings
            edges.append(
                {
                    "edge_id": (
                        "computed-edge::"
                        f"{left.reaction_entity_id}::{right.reaction_entity_id}::rdkit-fingerprint-tanimoto"
                    ),
                    "from_reaction_entity_id": left.reaction_entity_id,
                    "to_reaction_entity_id": right.reaction_entity_id,
                    "score": round(score, 6),
                    "confidence": _confidence_for_score(score, pair_warnings),
                    "basis": [EDGE_BASIS],
                    "provider_ids": [PROVIDER_ID],
                    "source_hashes": [left.source_hash, right.source_hash],
                    "metadata": {
                        "algorithm": FINGERPRINT_ALGORITHM,
                        "block_similarity": contributions,
                        "block_weights": BLOCK_WEIGHTS,
                    },
                    "warnings": pair_warnings,
                }
            )
        return edges


@dataclass(frozen=True)
class ReactionFingerprint:
    reactant_bits: set[int]
    product_bits: set[int]
    gained_bits: set[int]
    lost_bits: set[int]
    bits: set[int]

    @staticmethod
    def from_side_bits(
        reactant_bits: set[int],
        product_bits: set[int],
        *,
        side_dimension: int,
    ) -> "ReactionFingerprint":
        gained_bits = product_bits - reactant_bits
        lost_bits = reactant_bits - product_bits
        return ReactionFingerprint(
            reactant_bits=set(reactant_bits),
            product_bits=set(product_bits),
            gained_bits=gained_bits,
            lost_bits=lost_bits,
            bits={
                *reactant_bits,
                *(side_dimension + bit for bit in product_bits),
                *(side_dimension * 2 + bit for bit in gained_bits),
                *(side_dimension * 3 + bit for bit in lost_bits),
            },
        )


@dataclass(frozen=True)
class _FingerprintFeatureRecord:
    reaction_entity_id: str
    source_hash: str
    fingerprint: ReactionFingerprint
    warnings: list[str]


def run_rdkit_fingerprint_provider(
    reactions: list[ReactionInput],
    *,
    adapter: RdkitFingerprintAdapter | None = None,
    path_dimension: int = DEFAULT_COMPONENT_DIMENSION,
    morgan_dimension: int = DEFAULT_COMPONENT_DIMENSION,
    similarity_threshold: float = 0.0,
) -> dict[str, object]:
    return RdkitFingerprintProvider(
        adapter=adapter,
        path_dimension=path_dimension,
        morgan_dimension=morgan_dimension,
        similarity_threshold=similarity_threshold,
    ).run(reactions)


def _fingerprint_hash(dimension: int, bits: set[int]) -> str:
    payload = json.dumps(
        {"algorithm": FINGERPRINT_ALGORITHM, "bits": sorted(bits), "dimension": dimension},
        separators=(",", ":"),
    )
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


def _tanimoto(left: set[int], right: set[int]) -> float:
    union = left | right
    if not union:
        return 0.0
    return len(left & right) / len(union)


def _reaction_fingerprint_similarity(
    left: ReactionFingerprint,
    right: ReactionFingerprint,
) -> tuple[float, dict[str, float]]:
    contributions = {
        "reactant": _tanimoto(left.reactant_bits, right.reactant_bits),
        "product": _tanimoto(left.product_bits, right.product_bits),
        "gained": _tanimoto(left.gained_bits, right.gained_bits),
        "lost": _tanimoto(left.lost_bits, right.lost_bits),
    }
    score = sum(contributions[block] * BLOCK_WEIGHTS[block] for block in BLOCK_WEIGHTS)
    return round(score, 6), {block: round(value, 6) for block, value in contributions.items()}


def _confidence_for_score(score: float, warnings: list[str]) -> str:
    if warnings:
        return "low"
    if score >= 0.85:
        return "high"
    if score >= 0.65:
        return "medium"
    return "low"


def _provider_warnings(provider: ProviderReport, features: list[ComputedFeature]) -> list[str]:
    warnings = list(provider.get("warnings", []))
    invalid_count = sum(1 for feature in features if feature.get("warnings"))
    valid_count = sum(1 for feature in features if feature.get("fingerprint_refs"))
    if invalid_count:
        warnings.append(f"rdkit_fingerprint_reaction_warning_count:{invalid_count}")
    if not valid_count:
        warnings.append("rdkit_fingerprint_no_valid_reactions")
    return warnings
