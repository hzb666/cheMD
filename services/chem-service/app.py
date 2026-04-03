"""Minimal chem-service for OCR/normalize/render MVP routes."""

from __future__ import annotations

import importlib
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import escape
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
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
_MOLECULE_OCR_PROVIDER = os.environ.get("CHEM_SERVICE_MOLECULE_OCR_PROVIDER", "placeholder").strip().lower()
_REACTION_RENDER_PROVIDER = os.environ.get("CHEM_SERVICE_REACTION_RENDER_PROVIDER", "fallback").strip().lower()
_MATHPIX_API_URL = os.environ.get("CHEM_SERVICE_MATHPIX_API_URL", "https://api.mathpix.com/v3/latex").strip()
_MATHPIX_APP_ID = os.environ.get("CHEM_SERVICE_MATHPIX_APP_ID", "").strip()
_MATHPIX_APP_KEY = os.environ.get("CHEM_SERVICE_MATHPIX_APP_KEY", "").strip()
_MATHPIX_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_MATHPIX_TIMEOUT_SECONDS", 30)
_MOLSCRIBE_CHECKPOINT_PATH = os.environ.get("CHEM_SERVICE_MOLSCRIBE_CHECKPOINT_PATH", "").strip()
_MOLSCRIBE_HF_REPO = os.environ.get("CHEM_SERVICE_MOLSCRIBE_HF_REPO", "yujieq/MolScribe").strip()
_MOLSCRIBE_HF_FILE = os.environ.get(
    "CHEM_SERVICE_MOLSCRIBE_HF_FILE",
    "swin_base_char_aux_1m.pth",
).strip()
_MOLSCRIBE_DEVICE = os.environ.get("CHEM_SERVICE_MOLSCRIBE_DEVICE", "cpu").strip() or "cpu"
_ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "CHEM_SERVICE_ALLOW_ORIGINS",
        "http://127.0.0.1:2436,http://localhost:2436",
    ).split(",")
    if origin.strip()
}


def _extract_image_base64(payload: dict[str, Any]) -> tuple[str | None, Any | None]:
    image_base64 = payload.get("imageBase64")
    if not isinstance(image_base64, str) or not image_base64.strip():
        return None, (jsonify({"message": "imageBase64 is required"}), 400)
    if len(image_base64) > _MAX_IMAGE_BASE64_LENGTH:
        return None, (jsonify({"message": "imageBase64 is too large"}), 413)

    return image_base64, None


def _decode_image_bytes(image_base64: str) -> bytes | None:
    try:
        import base64

        return base64.b64decode(image_base64, validate=True)
    except Exception:
        return None


def _placeholder_ocr_response(message: str) -> Any:
    return jsonify(
        {
            "status": "failed",
            "warnings": [message],
        }
    )


def _resolve_image_suffix(mime_type: str | None) -> str:
    if mime_type == "image/jpeg":
        return ".jpg"
    if mime_type == "image/webp":
        return ".webp"
    if mime_type == "image/tiff":
        return ".tiff"
    return ".png"


def _extract_smiles_from_mathpix_text(text: str) -> str | None:
    normalized = text.strip()
    if not normalized:
        return None

    lower_text = normalized.lower()
    open_tag = "<smiles"
    if open_tag in lower_text and "</smiles>" in lower_text:
        start_tag_index = lower_text.find(open_tag)
        content_start = lower_text.find(">", start_tag_index)
        content_end = lower_text.find("</smiles>", content_start)
        if content_start != -1 and content_end != -1:
            candidate = normalized[content_start + 1 : content_end].strip()
            return candidate or None

    if normalized.startswith("\\text"):
        return None

    return normalized


def _request_mathpix_ocr(image_base64: str, mime_type: str | None) -> dict[str, Any]:
    if not _MATHPIX_APP_ID or not _MATHPIX_APP_KEY:
        return {
            "status": "failed",
            "warnings": ["Mathpix credentials are not configured."],
        }

    resolved_mime_type = mime_type or "image/png"
    payload = {
        "src": f"data:{resolved_mime_type};base64,{image_base64}",
        "ocr": ["text"],
        "formats": ["text"],
        "skip_recrop": True,
    }
    encoded_payload = json.dumps(payload).encode("utf-8")
    request_obj = urllib_request.Request(
        _MATHPIX_API_URL,
        data=encoded_payload,
        headers={
            "app_id": _MATHPIX_APP_ID,
            "app_key": _MATHPIX_APP_KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(request_obj, timeout=_MATHPIX_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Mathpix request failed ({error.code}): {body or error.reason}") from error
    except URLError as error:
        raise RuntimeError(f"Mathpix request failed: {error.reason}") from error

    try:
        return json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Mathpix returned invalid JSON") from error


_MOLSCRIBE_RUNTIME: Any | None = None


def _load_molscribe_runtime() -> Any | None:
    global _MOLSCRIBE_RUNTIME

    if _MOLSCRIBE_RUNTIME is not None:
        return _MOLSCRIBE_RUNTIME

    try:
        torch_module = importlib.import_module("torch")
        molscribe_module = importlib.import_module("molscribe")
        checkpoint_path = _MOLSCRIBE_CHECKPOINT_PATH
        if not checkpoint_path:
            huggingface_hub = importlib.import_module("huggingface_hub")
            checkpoint_path = huggingface_hub.hf_hub_download(_MOLSCRIBE_HF_REPO, _MOLSCRIBE_HF_FILE)
        if not checkpoint_path or not os.path.exists(checkpoint_path):
            return None
        runtime = molscribe_module.MolScribe(
            checkpoint_path,
            device=torch_module.device(_MOLSCRIBE_DEVICE),
        )
    except Exception:
        return None

    _MOLSCRIBE_RUNTIME = runtime
    return _MOLSCRIBE_RUNTIME


def _run_molecule_ocr_with_molscribe(image_bytes: bytes, mime_type: str | None) -> dict[str, Any] | None:
    runtime = _load_molscribe_runtime()
    if runtime is None:
        return None

    with tempfile.NamedTemporaryFile(suffix=_resolve_image_suffix(mime_type), delete=False) as handle:
        handle.write(image_bytes)
        temp_path = handle.name

    try:
        try:
            prediction = runtime.predict_image_file(temp_path, return_confidence=True)
        except TypeError:
            prediction = runtime.predict_image_file(temp_path)
    except Exception:
        prediction = None
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    if not isinstance(prediction, dict):
        return None

    smiles = prediction.get("smiles")
    molfile = prediction.get("molfile")
    confidence = prediction.get("confidence")
    if not isinstance(smiles, str) and not isinstance(molfile, str):
        return None

    return {
        "status": "ok",
        "structure": {
            "smiles": smiles.strip() if isinstance(smiles, str) else "",
            "molfile": molfile.strip() if isinstance(molfile, str) else None,
        },
        "confidence": float(confidence) if isinstance(confidence, (int, float)) else None,
        "warnings": [],
    }


def _run_molecule_ocr_with_decimer(image_bytes: bytes, mime_type: str | None) -> dict[str, Any] | None:
    try:
        decimer_module = importlib.import_module("DECIMER")
    except Exception:
        try:
            decimer_module = importlib.import_module("decimer")
        except Exception:
            return None

    predictor = getattr(decimer_module, "predict_SMILES", None) or getattr(
        decimer_module,
        "predict_smiles",
        None,
    )
    if not callable(predictor):
        return None

    with tempfile.NamedTemporaryFile(suffix=_resolve_image_suffix(mime_type), delete=False) as handle:
        handle.write(image_bytes)
        temp_path = handle.name

    try:
        prediction = predictor(temp_path)
    except Exception:
        prediction = None
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

    smiles: str | None = None
    confidence: float | None = None

    if isinstance(prediction, str):
        smiles = prediction.strip()
    elif isinstance(prediction, (list, tuple)) and prediction:
        head = prediction[0]
        if isinstance(head, str):
            smiles = head.strip()
        if len(prediction) > 1 and isinstance(prediction[1], (int, float)):
            confidence = float(prediction[1])
    elif isinstance(prediction, dict):
        raw_smiles = prediction.get("smiles") or prediction.get("SMILES")
        if isinstance(raw_smiles, str):
            smiles = raw_smiles.strip()
        raw_confidence = prediction.get("confidence")
        if isinstance(raw_confidence, (int, float)):
            confidence = float(raw_confidence)

    if not smiles:
        return None

    return {
        "status": "ok",
        "structure": {
            "smiles": smiles,
            "molfile": None,
        },
        "confidence": confidence,
        "warnings": [],
    }


def _run_molecule_ocr_with_mathpix(image_bytes: bytes, mime_type: str | None) -> dict[str, Any] | None:
    import base64

    payload = _request_mathpix_ocr(base64.b64encode(image_bytes).decode("utf-8"), mime_type)
    if not isinstance(payload, dict):
        return None
    if payload.get("status") == "failed":
        return {
            "status": "failed",
            "warnings": [
                warning
                for warning in payload.get("warnings", [])
                if isinstance(warning, str) and warning.strip()
            ]
            or ["Mathpix request failed."],
        }

    text_candidates = [
        payload.get("text"),
        payload.get("latex"),
        payload.get("latex_normal"),
    ]
    smiles = None
    for candidate in text_candidates:
        if isinstance(candidate, str):
            smiles = _extract_smiles_from_mathpix_text(candidate)
            if smiles:
                break

    warnings = []
    if isinstance(payload.get("error"), str) and payload["error"].strip():
        warnings.append(payload["error"].strip())
    if smiles is None:
        return {
            "status": "failed",
            "warnings": warnings or ["Mathpix did not return a SMILES string."],
        }

    confidence = payload.get("confidence")
    return {
        "status": "ok",
        "structure": {
            "smiles": smiles,
            "molfile": None,
        },
        "confidence": float(confidence) if isinstance(confidence, (int, float)) else None,
        "warnings": warnings,
    }


def _run_molecule_ocr_with_provider(image_bytes: bytes, mime_type: str | None) -> dict[str, Any] | None:
    if _MOLECULE_OCR_PROVIDER in {"", "placeholder", "disabled"}:
        return None

    if _MOLECULE_OCR_PROVIDER == "molscribe":
        return _run_molecule_ocr_with_molscribe(image_bytes, mime_type)
    if _MOLECULE_OCR_PROVIDER == "decimer":
        return _run_molecule_ocr_with_decimer(image_bytes, mime_type)
    if _MOLECULE_OCR_PROVIDER == "mathpix":
        return _run_molecule_ocr_with_mathpix(image_bytes, mime_type)

    return {
        "status": "failed",
        "warnings": [f"Unknown molecule OCR provider: {_MOLECULE_OCR_PROVIDER}"],
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


def _build_reaction_fallback_svg(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
) -> str:
    reaction_label = f"{' + '.join(reactants)} -> {' + '.join(products)}"
    conditions_label = f"Conditions: {' | '.join(conditions)}" if conditions else ""

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 140" role="img"'
        ' aria-label="Reaction fallback visualization">'
        '<rect x="1" y="1" width="538" height="138" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>'
        f'<text x="20" y="64" font-size="20" fill="#0f172a">{escape(reaction_label, quote=True)}</text>'
        f'<text x="20" y="96" font-size="14" fill="#475569">{escape(conditions_label, quote=True)}</text>'
        "</svg>"
    )


def _coerce_string_list(value: Any) -> list[str] | None:
    if not isinstance(value, list) or not value:
        return None

    items: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            return None
        items.append(item.strip())

    return items


def _build_reaction_render_payload(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    *,
    warnings: list[str] | None = None,
    renderer: str = "fallback",
) -> dict[str, Any]:
    return {
        "svg": _build_reaction_fallback_svg(
            reactants,
            products,
            conditions,
        ),
        "renderer": renderer,
        "reaction": {
            "reactants": reactants,
            "products": products,
            "conditions": conditions,
        },
        "warnings": warnings or ["RDKit reaction render fallback is active."],
    }


def _run_reaction_render_with_provider(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ = render_options

    if _REACTION_RENDER_PROVIDER in {"", "fallback", "placeholder"}:
        return _build_reaction_render_payload(reactants, products, conditions)

    return _build_reaction_render_payload(
        reactants,
        products,
        conditions,
        warnings=[
            f"Unknown reaction render provider: {_REACTION_RENDER_PROVIDER}",
            "RDKit reaction render fallback is active.",
        ],
    )


def _try_import_rdkit() -> tuple[Any, Any] | None:
    try:
        chem_module = importlib.import_module("rdkit.Chem")
        draw_module = importlib.import_module("rdkit.Chem.Draw.rdMolDraw2D")
    except Exception:
        return None

    return chem_module, draw_module


def _load_rdkit_molecule(chem_module: Any, smiles: str | None, molfile: str | None) -> Any | None:
    molecule = None

    if molfile:
        try:
            molecule = chem_module.MolFromMolBlock(molfile, sanitize=True)
        except Exception:
            molecule = None

    if molecule is None and smiles:
        try:
            molecule = chem_module.MolFromSmiles(smiles)
        except Exception:
            molecule = None

    return molecule


def _normalize_with_rdkit(smiles: str | None, molfile: str | None) -> dict[str, Any] | None:
    rdkit_modules = _try_import_rdkit()
    if rdkit_modules is None:
        return None

    chem_module, _ = rdkit_modules
    molecule = _load_rdkit_molecule(chem_module, smiles, molfile)
    if molecule is None:
        return None

    try:
        canonical_smiles = chem_module.MolToSmiles(molecule, canonical=True)
        normalized_molfile = chem_module.MolToMolBlock(molecule)
    except Exception:
        return None

    return {
        "canonicalSmiles": canonical_smiles,
        "normalizedMolfile": normalized_molfile or None,
        "warnings": [],
    }


def _render_with_rdkit(smiles: str | None, molfile: str | None) -> dict[str, Any] | None:
    rdkit_modules = _try_import_rdkit()
    if rdkit_modules is None:
        return None

    chem_module, draw_module = rdkit_modules
    molecule = _load_rdkit_molecule(chem_module, smiles, molfile)
    if molecule is None:
        return None

    try:
        drawer = draw_module.MolDraw2DSVG(360, 120)
        draw_module.PrepareAndDrawMolecule(drawer, molecule)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
    except Exception:
        return None

    return {
        "svg": svg,
        "warnings": [],
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
    configured = False
    if _MOLECULE_OCR_PROVIDER == "mathpix":
        configured = bool(_MATHPIX_APP_ID and _MATHPIX_APP_KEY)
    elif _MOLECULE_OCR_PROVIDER == "molscribe":
        configured = bool(_MOLSCRIBE_CHECKPOINT_PATH)
    elif _MOLECULE_OCR_PROVIDER in {"placeholder", "disabled", ""}:
        configured = False
    else:
        configured = True

    return jsonify(
        {
            "status": "ok",
            "ocr": {
                "provider": _MOLECULE_OCR_PROVIDER or "placeholder",
                "configured": configured,
            },
        }
    )


@app.route("/ocr", methods=["POST", "OPTIONS"])
def ocr() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    image_base64, error = _extract_image_base64(payload)
    if error:
        return error

    image_bytes = _decode_image_bytes(image_base64)
    if image_bytes is None:
        return jsonify({"message": "imageBase64 is invalid"}), 400

    mime_type = payload.get("mimeType")
    provider_payload = _run_molecule_ocr_with_provider(
        image_bytes,
        mime_type if isinstance(mime_type, str) else None,
    )
    if provider_payload is not None:
        return jsonify(provider_payload)

    return _placeholder_ocr_response(
        "MolScribe is not enabled; placeholder structure was not persisted."
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

    rdkit_payload = _normalize_with_rdkit(normalized_smiles, normalized_molfile)
    if rdkit_payload is not None:
        return jsonify(rdkit_payload)

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

    rdkit_payload = _render_with_rdkit(normalized_smiles, normalized_molfile)
    if rdkit_payload is not None:
        return jsonify(rdkit_payload)

    display = normalized_smiles or normalized_molfile or "structure"
    svg = _build_molecule_fallback_svg(display)

    return jsonify(
        {
            "svg": svg,
            "warnings": ["RDKit render fallback is active."],
        }
    )


@app.route("/reaction/ocr", methods=["POST", "OPTIONS"])
def reaction_ocr() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    _, error = _extract_image_base64(payload)
    if error:
        return error

    return _placeholder_ocr_response(
        "Reaction OCR provider is not enabled; placeholder reaction was not persisted."
    )


@app.route("/reaction/render", methods=["POST", "OPTIONS"])
def reaction_render() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    reactants = _coerce_string_list(payload.get("reactants"))
    products = _coerce_string_list(payload.get("products"))
    conditions = payload.get("conditions")
    render_options = payload.get("renderOptions")

    if reactants is None or products is None:
        return jsonify({"message": "reactants and products are required"}), 400

    if conditions is None:
        normalized_conditions: list[str] = []
    else:
        normalized_conditions = _coerce_string_list(conditions) or []
        if isinstance(conditions, list) and len(conditions) > 0 and not normalized_conditions:
            return jsonify({"message": "conditions must be a non-empty string array"}), 400

    return jsonify(
        _run_reaction_render_with_provider(
            reactants,
            products,
            normalized_conditions,
            render_options if isinstance(render_options, dict) else None,
        )
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

