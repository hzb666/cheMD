from __future__ import annotations

import logging
from collections.abc import Callable
from html import escape
from typing import Any

LOGGER = logging.getLogger(__name__)


def _read_render_background_config(render_options: dict[str, Any] | None) -> dict[str, bool]:
    structure_options = (
        render_options.get("structure") if isinstance(render_options, dict) else None
    )
    export_options = render_options.get("export") if isinstance(render_options, dict) else None

    background_color = (
        structure_options.get("backgroundColor") if isinstance(structure_options, dict) else None
    )
    transparent_background = (
        export_options.get("transparentBackground")
        if isinstance(export_options, dict)
        and isinstance(export_options.get("transparentBackground"), bool)
        else False
    )

    if (
        not transparent_background
        and isinstance(background_color, str)
        and background_color.strip().lower() in {"transparent", "#0000", "#00000000"}
    ):
        transparent_background = True

    return {"transparent_background": transparent_background}


def _load_rdkit_molecule(chem_module: Any, smiles: str | None, molfile: str | None) -> Any | None:
    molecule = None

    if molfile:
        try:
            molecule = chem_module.MolFromMolBlock(molfile, sanitize=True)
        except (AttributeError, TypeError, ValueError, RuntimeError) as error:
            LOGGER.warning("RDKit normalize skipped invalid molfile payload: %s", error)
            molecule = None

    if molecule is None and smiles:
        try:
            molecule = chem_module.MolFromSmiles(smiles)
        except (AttributeError, TypeError, ValueError, RuntimeError) as error:
            LOGGER.warning("RDKit normalize skipped invalid smiles payload: %s", error)
            molecule = None

    return molecule


def _serialize_rdkit_molecule(chem_module: Any, molecule: Any) -> dict[str, Any] | None:
    try:
        canonical_smiles = chem_module.MolToSmiles(molecule, canonical=True)
        normalized_molfile = chem_module.MolToMolBlock(molecule)
    except (AttributeError, TypeError, ValueError, RuntimeError) as error:
        LOGGER.warning("RDKit serialization failed: %s", error)
        return None

    return {
        "canonicalSmiles": canonical_smiles,
        "normalizedMolfile": normalized_molfile or None,
    }


def _normalize_with_rdkit(
    smiles: str | None,
    molfile: str | None,
    *,
    try_import_rdkit: Callable[[], tuple[Any, Any, Any] | None],
) -> dict[str, Any] | None:
    rdkit_modules = try_import_rdkit()
    if rdkit_modules is None:
        LOGGER.info("RDKit molecule normalization fallback: RDKit is unavailable.")
        return None

    chem_module, _, _ = rdkit_modules
    molecule = _load_rdkit_molecule(chem_module, smiles, molfile)
    if molecule is None:
        return None

    serialized = _serialize_rdkit_molecule(chem_module, molecule)
    if serialized is None:
        return None

    return {
        **serialized,
        "warnings": [],
    }


def _render_with_rdkit(
    smiles: str | None,
    molfile: str | None,
    render_options: dict[str, Any] | None = None,
    *,
    try_import_rdkit: Callable[[], tuple[Any, Any, Any] | None],
) -> dict[str, Any] | None:
    rdkit_modules = try_import_rdkit()
    if rdkit_modules is None:
        LOGGER.info("RDKit molecule render fallback: RDKit is unavailable.")
        return None

    chem_module, draw_module, _ = rdkit_modules
    molecule = _load_rdkit_molecule(chem_module, smiles, molfile)
    if molecule is None:
        return None

    serialized = _serialize_rdkit_molecule(chem_module, molecule)
    if serialized is None:
        return None

    background_config = _read_render_background_config(render_options)
    try:
        drawer = draw_module.MolDraw2DSVG(360, 120)
        if background_config["transparent_background"]:
            try:
                drawer.drawOptions().clearBackground = False
            except (AttributeError, TypeError) as error:
                LOGGER.debug("RDKit molecule drawer does not support clearBackground: %s", error)
        draw_module.PrepareAndDrawMolecule(drawer, molecule)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
    except (AttributeError, TypeError, ValueError, RuntimeError) as error:
        LOGGER.warning("RDKit molecule render failed: %s", error)
        return None

    return {
        **serialized,
        "svg": svg,
        "warnings": [],
    }


def _build_molecule_fallback_svg(display: str) -> str:
    safe_display = escape(display, quote=True)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" role="img"'
        f' aria-label="Molecule {safe_display}">'
        '<rect x="1" y="1" width="358" height="118" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>'
        f'<text x="20" y="64" font-size="20" fill="#0f172a">{safe_display}</text>'
        "</svg>"
    )
