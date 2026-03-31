"""OCR route – POST /ocr."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from services.molscribe_service import MolscribeService
from services.rdkit_normalize_service import RdkitNormalizeService

ocr_bp = Blueprint("ocr", __name__)

_molscribe = MolscribeService()
_normalizer = RdkitNormalizeService()


@ocr_bp.post("/ocr")
def ocr() -> tuple:
    """Accept an image upload and return a normalized structure.

    Accepts ``multipart/form-data`` with a ``file`` field.

    Returns:
        JSON with ``smiles``, ``molfile``, ``confidence``, and ``warnings``.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    image_bytes = request.files["file"].read()
    if not image_bytes:
        return jsonify({"error": "Empty file"}), 400

    ocr_result = _molscribe.predict(image_bytes)
    normalize_result = _normalizer.normalize(
        smiles=ocr_result.get("smiles"),
        molfile=ocr_result.get("molfile"),
    )

    warnings = [*ocr_result.get("warnings", []), *normalize_result.get("warnings", [])]

    return jsonify(
        {
            "smiles": normalize_result["canonical_smiles"],
            "molfile": normalize_result["normalized_molfile"],
            "confidence": ocr_result.get("confidence"),
            "warnings": warnings,
        }
    ), 200
