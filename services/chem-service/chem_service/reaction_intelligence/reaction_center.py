from __future__ import annotations

import re

from chem_service.reaction_intelligence.contracts import ReactionCenter

_ATOM_MAP_PATTERN = re.compile(r"\[[^\]]*:(\d+)[^\]]*\]")
_ATOM_MAP_NUMBER_PATTERN = re.compile(r":\d+(?=])")


def derive_reaction_center(
    reaction_id: str,
    mapped_reaction: str | None,
    *,
    confidence: float | None,
    min_confidence: float = 0.5,
) -> ReactionCenter:
    if confidence is not None and confidence < min_confidence:
        return _skipped(reaction_id, confidence, "Reaction mapping confidence is below threshold.")
    if not mapped_reaction:
        return _skipped(reaction_id, confidence, "Mapped reaction is empty.")
    if ">>" not in mapped_reaction:
        return _skipped(reaction_id, confidence, "Mapped reaction is missing the reaction arrow.")

    reactant_side, product_side = mapped_reaction.split(">>", 1)
    reactant_maps = _extract_mapped_atoms(reactant_side)
    product_maps = _extract_mapped_atoms(product_side)
    changed_maps = _find_changed_atom_maps(reactant_maps, product_maps)
    if not reactant_maps and not product_maps:
        return _skipped(reaction_id, confidence, "Mapped reaction contains no atom-map numbers.")
    if not changed_maps:
        return _skipped(reaction_id, confidence, "No textual reaction center change was detected.")

    return ReactionCenter(
        reaction_id=reaction_id,
        status="ok",
        signature=_build_signature(changed_maps, reactant_maps, product_maps),
        changed_atom_maps=changed_maps,
        confidence=confidence,
        warnings=[],
    )


def _extract_mapped_atoms(reaction_side: str) -> dict[int, list[str]]:
    mapped_atoms: dict[int, list[str]] = {}
    for match in _ATOM_MAP_PATTERN.finditer(reaction_side):
        atom_map = int(match.group(1))
        normalized_atom = _ATOM_MAP_NUMBER_PATTERN.sub("", match.group(0))
        mapped_atoms.setdefault(atom_map, []).append(normalized_atom)
    return {atom_map: sorted(set(labels)) for atom_map, labels in mapped_atoms.items()}


def _find_changed_atom_maps(
    reactant_maps: dict[int, list[str]],
    product_maps: dict[int, list[str]],
) -> list[int]:
    atom_maps = set(reactant_maps) | set(product_maps)
    return sorted(
        atom_map
        for atom_map in atom_maps
        if reactant_maps.get(atom_map) != product_maps.get(atom_map)
    )


def _build_signature(
    changed_maps: list[int],
    reactant_maps: dict[int, list[str]],
    product_maps: dict[int, list[str]],
) -> str:
    parts = []
    for atom_map in changed_maps:
        reactant_labels = ",".join(reactant_maps.get(atom_map, ["?"]))
        product_labels = ",".join(product_maps.get(atom_map, ["?"]))
        parts.append(f"{atom_map}:{reactant_labels}->{product_labels}")
    return "center::" + "|".join(parts)


def _skipped(reaction_id: str, confidence: float | None, warning: str) -> ReactionCenter:
    return ReactionCenter(
        reaction_id=reaction_id,
        status="skipped",
        signature=None,
        confidence=confidence,
        warnings=[warning],
    )
