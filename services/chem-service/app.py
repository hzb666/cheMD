"""Minimal chem-service for OCR/normalize/render MVP routes."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any

from flask import Flask, jsonify, request


def _read_int_env(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default

    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default

    if value < minimum:
        return default

    return value


app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = _read_int_env("CHEM_SERVICE_MAX_CONTENT_LENGTH", 5 * 1024 * 1024)


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
_CACHE_MAX_ENTRIES = _read_int_env("CHEM_SERVICE_CACHE_MAX_ENTRIES", 256)
_MAX_IMAGE_BASE64_LENGTH = _read_int_env("CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH", 4 * 1024 * 1024)
_ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "CHEM_SERVICE_ALLOW_ORIGINS",
        "http://127.0.0.1:2436,http://localhost:2436",
    ).split(",")
    if origin.strip()
}


def _cache_key(document_id: str, block_id: str) -> str:
    return f"{document_id}::{block_id}"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _prune_cache() -> None:
    now = _utcnow()
    expired = [
        key for key, record in _CACHE.items() if datetime.fromisoformat(record.expires_at) <= now
    ]
    for key in expired:
        _CACHE.pop(key, None)


def _enforce_cache_limit() -> None:
    while len(_CACHE) >= _CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_CACHE), None)
        if oldest_key is None:
            return
        _CACHE.pop(oldest_key, None)


def _save_cache(
    document_id: str,
    block_id: str,
    smiles: str,
    molfile: str | None,
    source: str,
    confidence: float | None = None,
) -> StructureRecord:
    _prune_cache()
    _enforce_cache_limit()
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
    origin = request.headers.get("Origin")
    if origin and origin in _ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
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
    if len(image_base64) > _MAX_IMAGE_BASE64_LENGTH:
        return jsonify({"message": "imageBase64 is too large"}), 413

    # Until a real OCR backend is wired, surface the placeholder explicitly as a failure
    # so callers do not silently persist fake chemistry.
    return jsonify(
        {
            "status": "failed",
            "warnings": ["MolScribe is not enabled; placeholder structure was not persisted."],
        }
    )


@app.route("/normalize", methods=["POST", "OPTIONS"])
def normalize() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")
    normalized_smiles = smiles.strip() if isinstance(smiles, str) else None
    normalized_molfile = molfile.strip() if isinstance(molfile, str) else None

    if not normalized_smiles and not normalized_molfile:
        return jsonify({"message": "smiles or molfile is required"}), 400

    return jsonify(
        {
            "canonicalSmiles": normalized_smiles or "",
            "normalizedMolfile": normalized_molfile or None,
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
    normalized_smiles = smiles.strip() if isinstance(smiles, str) else None
    normalized_molfile = molfile.strip() if isinstance(molfile, str) else None

    if not normalized_smiles and not normalized_molfile:
        return jsonify({"message": "smiles or molfile is required"}), 400

    display = normalized_smiles or normalized_molfile or "structure"
    safe_display = escape(display, quote=True)
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 120" role="img"'
        f' aria-label="Molecule {safe_display}">'
        '<rect x="1" y="1" width="358" height="118" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>'
        f'<text x="20" y="64" font-size="20" fill="#0f172a">{safe_display}</text>'
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
    app.run(
        host=os.environ.get("CHEM_SERVICE_HOST", "127.0.0.1"),
        port=_read_int_env("CHEM_SERVICE_PORT", 18081),
    )


if __name__ == "__main__":
    main()

