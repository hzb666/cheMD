"""Normalize route – POST /normalize."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.rdkit_normalize_service import RdkitNormalizeService

normalize_bp = Blueprint("normalize", __name__)

_normalizer = RdkitNormalizeService()


@normalize_bp.post("/normalize")
def normalize() -> tuple:
    """Normalize a chemical structure.

    Accepts JSON body with optional ``smiles`` and ``molfile`` fields.

    Returns:
        JSON with ``canonical_smiles``, ``normalized_molfile``, and ``warnings``.
    """
    body = request.get_json(silent=True) or {}
    smiles = body.get("smiles")
    molfile = body.get("molfile")

    if not smiles and not molfile:
        return jsonify({"error": "Provide at least one of: smiles, molfile"}), 400

    result = _normalizer.normalize(smiles=smiles, molfile=molfile)
    return jsonify(result), 200
