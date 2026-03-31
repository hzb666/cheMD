"""Render route – POST /render."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.rdkit_render_service import RdkitRenderService

render_bp = Blueprint("render", __name__)

_renderer = RdkitRenderService()


@render_bp.post("/render")
def render() -> tuple:
    """Render a chemical structure to SVG.

    Accepts JSON body with optional ``smiles``, ``molfile``, ``width``, and
    ``height`` fields.

    Returns:
        JSON with ``svg`` and ``warnings``.
    """
    body = request.get_json(silent=True) or {}
    smiles = body.get("smiles")
    molfile = body.get("molfile")
    width = int(body.get("width", 400))
    height = int(body.get("height", 300))

    if not smiles and not molfile:
        return jsonify({"error": "Provide at least one of: smiles, molfile"}), 400

    result = _renderer.render(smiles=smiles, molfile=molfile, width=width, height=height)
    return jsonify(result), 200
