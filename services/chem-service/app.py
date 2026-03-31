"""Minimal chem-service for OCR/normalize/render MVP routes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from flask import Flask, jsonify, request

app = Flask(__name__)


@dataclass(slots=True)
class StructureRecord:
    document_id: str
    block_id: str
    smiles: str
    molfile: str | None
    source: str
    confidence: float | None
    updated_at: str
    expires_at: str


_CACHE: dict[str, StructureRecord] = {}
_CACHE_TTL_SECONDS = 300


def _cache_key(document_id: str, block_id: str) -> str:
    return f"{document_id}::{block_id}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _prune_cache() -> None:
    now = _utcnow()
    expired = [
        key
        for key, record in _CACHE.items()
        if datetime.fromisoformat(record.expires_at) <= now
    ]
    for key in expired:
        _CACHE.pop(key, None)


def _save_cache(
    document_id: str,
    block_id: str,
    smiles: str,
    molfile: str | None,
    source: str,
    confidence: float | None = None,
) -> StructureRecord:
    _prune_cache()
    now = _utcnow()
    record = StructureRecord(
        document_id=document_id,
        block_id=block_id,
        smiles=smiles,
        molfile=molfile,
        source=source,
        confidence=confidence,
        updated_at=now.isoformat(),
        expires_at=(now + timedelta(seconds=_CACHE_TTL_SECONDS)).isoformat(),
    )
    _CACHE[_cache_key(document_id, block_id)] = record
    return record


@app.after_request
def _apply_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


@app.route("/healthz", methods=["GET"])
def healthz() -> Any:
    return jsonify({"status": "ok"})


@app.route("/ocr", methods=["POST", "OPTIONS"])
def ocr() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    image_base64 = payload.get("imageBase64")
    if not isinstance(image_base64, str) or not image_base64.strip():
        return jsonify({"message": "imageBase64 is required"}), 400

    # MVP fallback: returns a stable sample structure until MolScribe is wired.
    smiles = "CCO"
    return jsonify(
        {
            "status": "ok",
            "structure": {
                "smiles": smiles,
                "molfile": "MOLFILE_PLACEHOLDER",
            },
            "confidence": 0.0,
            "warnings": ["MolScribe is not enabled; returned placeholder structure."],
        }
    )


@app.route("/normalize", methods=["POST", "OPTIONS"])
def normalize() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")

    if not isinstance(smiles, str) and not isinstance(molfile, str):
        return jsonify({"message": "smiles or molfile is required"}), 400

    canonical_smiles = (smiles if isinstance(smiles, str) else "CCO").strip() or "CCO"
    normalized_molfile = molfile if isinstance(molfile, str) and molfile.strip() else None

    return jsonify(
        {
            "canonicalSmiles": canonical_smiles,
            "normalizedMolfile": normalized_molfile,
            "warnings": ["RDKit normalization fallback is active."],
        }
    )


@app.route("/render", methods=["POST", "OPTIONS"])
def render() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")

    if not isinstance(smiles, str) and not isinstance(molfile, str):
        return jsonify({"message": "smiles or molfile is required"}), 400

    display = (smiles if isinstance(smiles, str) else "structure").strip() or "structure"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" role="img"'
        f' aria-label="Molecule {display}">'
        '<rect x="1" y="1" width="358" height="118" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>'
        f'<text x="20" y="64" font-size="20" fill="#0f172a">{display}</text>'
        "</svg>"
    )

    return jsonify(
        {
            "svg": svg,
            "warnings": ["RDKit render fallback is active."],
        }
    )


@app.route("/structure", methods=["GET", "POST", "OPTIONS"])
def structure() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        _prune_cache()
        document_id = request.args.get("documentId", type=str)
        block_id = request.args.get("blockId", type=str)
        if not document_id or not block_id:
            return jsonify({"message": "documentId and blockId are required"}), 400

        record = _CACHE.get(_cache_key(document_id, block_id))
        if not record:
            return jsonify({"found": False})

        return jsonify(
            {
                "found": True,
                "structure": {
                    "smiles": record.smiles,
                    "molfile": record.molfile,
                    "source": record.source,
                    "expiresAt": record.expires_at,
                },
            }
        )

    payload = request.get_json(silent=True) or {}
    document_id = payload.get("documentId")
    block_id = payload.get("blockId")
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")
    source = payload.get("source", "manual")
    confidence = payload.get("confidence")

    if not isinstance(document_id, str) or not isinstance(block_id, str):
        return jsonify({"message": "documentId and blockId are required"}), 400

    if not isinstance(smiles, str) or not smiles.strip():
        return jsonify({"message": "smiles is required"}), 400

    conf = float(confidence) if isinstance(confidence, (int, float)) else None
    record = _save_cache(
        document_id=document_id,
        block_id=block_id,
        smiles=smiles.strip(),
        molfile=molfile if isinstance(molfile, str) else None,
        source=source if isinstance(source, str) else "manual",
        confidence=conf,
    )

    return jsonify(
        {
            "documentId": record.document_id,
            "blockId": record.block_id,
            "smiles": record.smiles,
            "molfile": record.molfile,
            "source": record.source,
            "confidence": record.confidence,
            "updatedAt": record.updated_at,
            "expiresAt": record.expires_at,
        }
    )


def main() -> None:
    """Run chem-service development server."""
    app.run(host="0.0.0.0", port=18081)


if __name__ == "__main__":
    main()
