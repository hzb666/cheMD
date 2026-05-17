from __future__ import annotations

from itertools import combinations
from typing import Any

BOND_LABELS = {"-": "single", "=": "double", "#": "triple", ":": "aromatic", "~": "single"}
CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}


def derive_reaction_center(
    mapped_rxn: str,
    mapping_confidence: float | None = None,
    *,
    low_confidence_threshold: float = 0.65,
    high_confidence_threshold: float = 0.9,
) -> dict[str, Any]:
    warnings: list[str] = []
    try:
        reactants, products = _split_reaction(mapped_rxn)
        reactant_atoms, reactant_bonds = _parse_mapped_side(reactants)
        product_atoms, product_bonds = _parse_mapped_side(products)
    except ValueError as exc:
        return _low_confidence_center([str(exc)])

    if not reactant_atoms or not product_atoms:
        return _low_confidence_center(["mapped_reaction_has_no_atom_maps"])

    changed_bonds = _changed_bonds(reactant_atoms, reactant_bonds, product_atoms, product_bonds)
    changed_atom_maps = sorted(
        {atom_map for item in changed_bonds for atom_map in _bond_atom_maps(item)}
    )
    if not changed_bonds or not changed_atom_maps:
        warnings.append("reaction_center_not_reliably_detected")
    if mapping_confidence is None:
        warnings.append("mapping_confidence_missing")
    elif mapping_confidence < low_confidence_threshold:
        warnings.append("low_mapping_confidence")

    return _center(
        _center_signature(changed_bonds, reactant_atoms, product_atoms),
        changed_bonds,
        [_atom_label(atom_map, reactant_atoms, product_atoms) for atom_map in changed_atom_maps],
        _center_confidence(
            mapping_confidence, warnings, low_confidence_threshold, high_confidence_threshold
        ),
        warnings,
    )


def build_reaction_center_similarity_edges(
    reaction_features: list[dict[str, Any]],
    *,
    provider_id: str = "provider::rxnmapper",
) -> list[dict[str, Any]]:
    edges: list[dict[str, Any]] = []
    usable = [
        feature
        for feature in reaction_features
        if isinstance(feature.get("reaction_center"), dict)
        and feature["reaction_center"].get("center_signature") != "unresolved"
    ]
    for left, right in combinations(usable, 2):
        basis = _edge_basis(left["reaction_center"], right["reaction_center"])
        if basis is None:
            continue
        confidence = _edge_confidence(left["reaction_center"], right["reaction_center"], basis)
        warnings = _edge_warnings(left["reaction_center"], right["reaction_center"])
        if confidence == "low":
            warnings.append("low_confidence_reaction_center_edge")
        edges.append(
            {
                "edge_id": _edge_id(left["reaction_entity_id"], right["reaction_entity_id"], basis),
                "from_reaction_entity_id": left["reaction_entity_id"],
                "to_reaction_entity_id": right["reaction_entity_id"],
                "score": 1.0 if basis == "same_reaction_center" else 0.72,
                "confidence": confidence,
                "basis": [basis],
                "provider_ids": [provider_id],
                "source_hashes": [left.get("source_hash", ""), right.get("source_hash", "")],
                "warnings": warnings,
            }
        )
    return edges


def _split_reaction(mapped_rxn: str) -> tuple[str, str]:
    if not isinstance(mapped_rxn, str) or not mapped_rxn:
        raise ValueError("mapped_reaction_is_empty")
    parts = mapped_rxn.split(">")
    if len(parts) != 3:
        raise ValueError("mapped_reaction_must_have_three_sections")
    if not parts[0] or not parts[2]:
        raise ValueError("mapped_reaction_missing_reactants_or_products")
    return parts[0], parts[2]


def _parse_mapped_side(side: str) -> tuple[dict[int, str], dict[tuple[int, int], str]]:
    atoms: dict[int, str] = {}
    bonds: dict[tuple[int, int], str] = {}
    stack: list[int | None] = []
    rings: dict[str, tuple[int, str]] = {}
    current: int | None = None
    pending = "-"
    index = 0
    while index < len(side):
        char = side[index]
        if char == "[":
            index, current, pending = _read_atom(side, index, atoms, bonds, current, pending)
        elif char in "-=#:":
            pending = char
            index += 1
        elif char == ".":
            current, pending = None, "-"
            index += 1
        elif char == "(":
            stack.append(current)
            index += 1
        elif char == ")":
            current = stack.pop() if stack else None
            index += 1
        elif char.isdigit() and current is not None:
            _read_ring(char, current, pending, rings, bonds)
            pending = "-"
            index += 1
        else:
            index += 1
    return atoms, bonds


def _read_atom(
    side: str,
    index: int,
    atoms: dict[int, str],
    bonds: dict[tuple[int, int], str],
    current: int | None,
    pending: str,
) -> tuple[int, int | None, str]:
    end = side.find("]", index)
    if end == -1:
        raise ValueError("mapped_reaction_has_unclosed_atom")
    token = side[index + 1 : end]
    atom_map = _atom_map(token)
    if atom_map is None:
        return end + 1, current, "-"
    atoms[atom_map] = _atom_symbol(token)
    if current is not None:
        _add_bond(bonds, current, atom_map, pending)
    return end + 1, atom_map, "-"


def _read_ring(
    ring_id: str,
    current: int,
    pending: str,
    rings: dict[str, tuple[int, str]],
    bonds: dict[tuple[int, int], str],
) -> None:
    if ring_id not in rings:
        rings[ring_id] = (current, pending)
        return
    other, ring_bond = rings.pop(ring_id)
    _add_bond(bonds, current, other, pending if pending != "-" else ring_bond)


def _atom_map(token: str) -> int | None:
    if ":" not in token:
        return None
    digits = ""
    for char in token.rsplit(":", 1)[1]:
        if not char.isdigit():
            break
        digits += char
    return int(digits) if digits else None


def _atom_symbol(token: str) -> str:
    body = token.rsplit(":", 1)[0]
    if not body:
        return "?"
    if body[0] == "*":
        return "*"
    if len(body) >= 2 and body[0].isalpha() and body[1].islower():
        return body[:2].capitalize()
    return body[0].upper() if body[0].isalpha() else "?"


def _add_bond(bonds: dict[tuple[int, int], str], left: int, right: int, order: str) -> None:
    if left != right:
        bonds[tuple(sorted((left, right)))] = BOND_LABELS.get(order, "single")


def _changed_bonds(
    reactant_atoms: dict[int, str],
    reactant_bonds: dict[tuple[int, int], str],
    product_atoms: dict[int, str],
    product_bonds: dict[tuple[int, int], str],
) -> list[str]:
    changed: list[str] = []
    for pair in sorted(set(reactant_bonds) | set(product_bonds)):
        before = reactant_bonds.get(pair)
        after = product_bonds.get(pair)
        if before == after:
            continue
        left = _atom_label(pair[0], reactant_atoms, product_atoms)
        right = _atom_label(pair[1], reactant_atoms, product_atoms)
        changed.append(_changed_bond_label(left, right, before, after))
    return changed


def _changed_bond_label(left: str, right: str, before: str | None, after: str | None) -> str:
    if before is None:
        return f"formed:{left}-{right}:{after}"
    if after is None:
        return f"broken:{left}-{right}:{before}"
    return f"changed:{left}-{right}:{before}->{after}"


def _bond_atom_maps(changed_bond: str) -> set[int]:
    atom_maps: set[int] = set()
    atom_label = changed_bond.split(":", 1)[1].split(":", 1)[0]
    for item in atom_label.split("-"):
        digits = "".join(char for char in item if char.isdigit())
        if digits:
            atom_maps.add(int(digits))
    return atom_maps


def _atom_label(
    atom_map: int, reactant_atoms: dict[int, str], product_atoms: dict[int, str]
) -> str:
    return f"{product_atoms.get(atom_map) or reactant_atoms.get(atom_map) or '?'}{atom_map}"


def _center_signature(
    changed_bonds: list[str],
    reactant_atoms: dict[int, str],
    product_atoms: dict[int, str],
) -> str:
    if not changed_bonds:
        return "unresolved"
    generalized = [_generalized_bond(item, reactant_atoms, product_atoms) for item in changed_bonds]
    return "bonds:" + "|".join(sorted(generalized))


def _generalized_bond(
    changed_bond: str,
    reactant_atoms: dict[int, str],
    product_atoms: dict[int, str],
) -> str:
    action, rest = changed_bond.split(":", 1)
    atom_part, order_part = rest.split(":", 1)
    elements = []
    for atom_label in atom_part.split("-"):
        atom_map = int("".join(char for char in atom_label if char.isdigit()))
        elements.append(product_atoms.get(atom_map) or reactant_atoms.get(atom_map) or "?")
    return f"{action}:{'-'.join(sorted(elements))}:{order_part}"


def _center_confidence(
    mapping_confidence: float | None,
    warnings: list[str],
    low_threshold: float,
    high_threshold: float,
) -> str:
    if warnings or mapping_confidence is None or mapping_confidence < low_threshold:
        return "low"
    return "high" if mapping_confidence >= high_threshold else "medium"


def _low_confidence_center(warnings: list[str]) -> dict[str, Any]:
    return _center("unresolved", [], [], "low", warnings)


def _center(
    signature: str,
    changed_bonds: list[str],
    changed_atoms: list[str],
    confidence: str,
    warnings: list[str],
) -> dict[str, Any]:
    return {
        "provider": "rxnmapper_derived",
        "center_signature": signature,
        "changed_bonds": changed_bonds,
        "changed_atoms": changed_atoms,
        "confidence": confidence,
        "warnings": warnings,
    }


def _edge_basis(left: dict[str, Any], right: dict[str, Any]) -> str | None:
    if left.get("center_signature") == right.get("center_signature"):
        return "same_reaction_center"
    if _changed_elements(left) and _changed_elements(left) == _changed_elements(right):
        return "compatible_reaction_center"
    return None


def _changed_elements(center: dict[str, Any]) -> set[str]:
    return {
        "".join(char for char in atom if char.isalpha()) for atom in center.get("changed_atoms", [])
    }


def _edge_confidence(left: dict[str, Any], right: dict[str, Any], basis: str) -> str:
    left_rank = CONFIDENCE_RANK.get(left.get("confidence", "low"), 0)
    right_rank = CONFIDENCE_RANK.get(right.get("confidence", "low"), 0)
    minimum = min(left_rank, right_rank)
    if minimum == 0:
        return "low"
    if basis == "same_reaction_center" and minimum == 2 and not _edge_warnings(left, right):
        return "high"
    return "medium"


def _edge_warnings(left: dict[str, Any], right: dict[str, Any]) -> list[str]:
    return list(left.get("warnings", [])) + list(right.get("warnings", []))


def _edge_id(left_id: str, right_id: str, basis: str) -> str:
    first, second = sorted((left_id, right_id))
    return f"computed-edge::{first}::{second}::{basis}"
