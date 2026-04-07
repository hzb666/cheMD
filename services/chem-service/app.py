"""Minimal chem-service for OCR/normalize/render MVP routes."""

from __future__ import annotations

import importlib
import json
import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from html import escape
from typing import Any
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

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


def _read_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    return default


app = Flask(__name__)


@dataclass(slots=True)
class StructureRecord:
    kind: str
    document_id: str
    block_id: str
    session_id: str
    smiles: str | None
    molfile: str | None
    reactants: list[str] | None
    products: list[str] | None
    conditions: list[str] | None
    reaction_smiles: str | None
    rxnfile: str | None
    source: str
    confidence: float | None
    updated_at: str
    expires_at: str


_CACHE: dict[str, StructureRecord] = {}
_CACHE_TTL_SECONDS = 300
_CACHE_MAX_ENTRIES = _read_int_env("CHEM_SERVICE_CACHE_MAX_ENTRIES", 256)
_MAX_UPLOAD_BYTES = _read_int_env("CHEM_SERVICE_MAX_UPLOAD_BYTES", 5 * 1024 * 1024)
_MAX_IMAGE_BASE64_LENGTH = _read_int_env(
    "CHEM_SERVICE_MAX_IMAGE_BASE64_LENGTH",
    ((max(_MAX_UPLOAD_BYTES, 1) + 2) // 3) * 4,
)
_MOLECULE_OCR_PROVIDER = (
    os.environ.get("CHEM_SERVICE_MOLECULE_OCR_PROVIDER", "placeholder").strip().lower()
)
_REACTION_OCR_PROVIDER = (
    os.environ.get("CHEM_SERVICE_REACTION_OCR_PROVIDER", "placeholder").strip().lower()
)
_MOLSCRIBE_API_URL = os.environ.get("CHEM_SERVICE_MOLSCRIBE_API_URL", "").strip()
_MOLSCRIBE_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_MOLSCRIBE_TIMEOUT_SECONDS", 60)
_MOLSCRIBE_API_KEY = os.environ.get("CHEM_SERVICE_MOLSCRIBE_API_KEY", "").strip()
_DECIMER_API_URL = os.environ.get("CHEM_SERVICE_DECIMER_API_URL", "").strip()
_DECIMER_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_DECIMER_TIMEOUT_SECONDS", 60)
_DECIMER_API_KEY = os.environ.get("CHEM_SERVICE_DECIMER_API_KEY", "").strip()
_MOLNEXTR_API_URL = os.environ.get("CHEM_SERVICE_MOLNEXTR_API_URL", "").strip()
_MOLNEXTR_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_MOLNEXTR_TIMEOUT_SECONDS", 60)
_MOLNEXTR_API_KEY = os.environ.get("CHEM_SERVICE_MOLNEXTR_API_KEY", "").strip()
_RXNSCRIBE_API_URL = os.environ.get("CHEM_SERVICE_RXNSCRIBE_API_URL", "").strip()
_RXNSCRIBE_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_RXNSCRIBE_TIMEOUT_SECONDS", 60)
_RXNSCRIBE_API_KEY = os.environ.get("CHEM_SERVICE_RXNSCRIBE_API_KEY", "").strip()
_RXNIM_API_URL = os.environ.get("CHEM_SERVICE_RXNIM_API_URL", "").strip()
_RXNIM_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_RXNIM_TIMEOUT_SECONDS", 60)
_RXNIM_API_KEY = os.environ.get("CHEM_SERVICE_RXNIM_API_KEY", "").strip()
_RXNCAPTION_API_URL = os.environ.get("CHEM_SERVICE_RXNCAPTION_API_URL", "").strip()
_RXNCAPTION_TIMEOUT_SECONDS = _read_int_env("CHEM_SERVICE_RXNCAPTION_TIMEOUT_SECONDS", 60)
_RXNCAPTION_API_KEY = os.environ.get("CHEM_SERVICE_RXNCAPTION_API_KEY", "").strip()
_MOLSCRIBE_CHECKPOINT_PATH = os.environ.get("CHEM_SERVICE_MOLSCRIBE_CHECKPOINT_PATH", "").strip()
_MOLSCRIBE_HF_REPO = os.environ.get("CHEM_SERVICE_MOLSCRIBE_HF_REPO", "yujieq/MolScribe").strip()
_MOLSCRIBE_HF_FILE = os.environ.get(
    "CHEM_SERVICE_MOLSCRIBE_HF_FILE",
    "swin_base_char_aux_1m.pth",
).strip()
_MOLSCRIBE_DEVICE = os.environ.get("CHEM_SERVICE_MOLSCRIBE_DEVICE", "cpu").strip() or "cpu"
_CHEM_SERVICE_ACCESS_KEY = os.environ.get("CHEM_SERVICE_ACCESS_KEY", "").strip()
_CHEM_SERVICE_INTERNAL_ONLY = _read_bool_env("CHEM_SERVICE_INTERNAL_ONLY", True)
_PROTECTED_PATHS = {
    "/ocr",
    "/normalize",
    "/render",
    "/reaction/ocr",
    "/reaction/render",
    "/structure",
}
_ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "CHEM_SERVICE_ALLOW_ORIGINS",
        "http://127.0.0.1:2436,http://localhost:2436",
    ).split(",")
    if origin.strip()
}
app.config["MAX_CONTENT_LENGTH"] = _read_int_env(
    "CHEM_SERVICE_MAX_CONTENT_LENGTH",
    _MAX_IMAGE_BASE64_LENGTH + 256 * 1024,
)


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


def _request_remote_json(
    *,
    url: str,
    payload: dict[str, Any],
    timeout_seconds: int,
    api_key: str | None = None,
) -> dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
    }
    if api_key:
        headers["X-Api-Key"] = api_key

    request_obj = urllib_request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urllib_request.urlopen(request_obj, timeout=timeout_seconds) as response:
            body = response.read().decode("utf-8")
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"Remote OCR request failed ({error.code}): {body or error.reason}"
        ) from error
    except URLError as error:
        raise RuntimeError(f"Remote OCR request failed: {error.reason}") from error

    try:
        payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Remote OCR provider returned invalid JSON") from error

    if not isinstance(payload, dict):
        raise RuntimeError("Remote OCR provider returned a non-object payload")

    return payload


def _normalize_warning_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _build_remote_molecule_ocr_payload(
    smiles: str | None,
    molfile: str | None,
    *,
    confidence: float | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "status": "ok",
        "structure": {
            "smiles": smiles or "",
            "molfile": molfile,
        },
        "confidence": confidence,
        "warnings": warnings or [],
    }


def _map_remote_molecule_payload(provider_label: str, payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("status") == "failed":
        return {
            "status": "failed",
            "warnings": _normalize_warning_list(payload.get("warnings"))
            or [f"{provider_label} remote provider returned failed status."],
        }

    structure = payload.get("structure") if isinstance(payload.get("structure"), dict) else None
    smiles: str | None = None
    molfile: str | None = None

    if provider_label == "MolNexTR":
        raw_smiles = payload.get("predicted_smiles")
        raw_molfile = payload.get("predicted_molfile")
    elif provider_label == "DECIMER":
        raw_smiles = payload.get("smiles") or payload.get("SMILES")
        raw_molfile = payload.get("molfile")
    else:
        raw_smiles = payload.get("smiles")
        raw_molfile = payload.get("molfile")

    if isinstance(raw_smiles, str) and raw_smiles.strip():
        smiles = raw_smiles.strip()
    elif isinstance(structure, dict):
        nested_smiles = structure.get("smiles")
        if isinstance(nested_smiles, str) and nested_smiles.strip():
            smiles = nested_smiles.strip()

    if isinstance(raw_molfile, str) and raw_molfile.strip():
        molfile = raw_molfile.strip()
    elif isinstance(structure, dict):
        nested_molfile = structure.get("molfile")
        if isinstance(nested_molfile, str) and nested_molfile.strip():
            molfile = nested_molfile.strip()

    confidence = payload.get("confidence")
    normalized_confidence = float(confidence) if isinstance(confidence, (int, float)) else None
    warnings = _normalize_warning_list(payload.get("warnings"))

    if not smiles and not molfile:
        return {
            "status": "failed",
            "warnings": (
                warnings
                or [f"{provider_label} remote payload did not contain a structure result."]
            ),
        }

    return _build_remote_molecule_ocr_payload(
        smiles,
        molfile,
        confidence=normalized_confidence,
        warnings=warnings,
    )


def _request_remote_molecule_provider(
    provider_label: str,
    *,
    image_bytes: bytes,
    mime_type: str | None,
    api_url: str,
    timeout_seconds: int,
    api_key: str | None = None,
) -> dict[str, Any]:
    import base64

    payload = _request_remote_json(
        url=api_url,
        payload={
            "imageBase64": base64.b64encode(image_bytes).decode("utf-8"),
            "mimeType": mime_type or "image/png",
        },
        timeout_seconds=timeout_seconds,
        api_key=api_key,
    )
    return _map_remote_molecule_payload(provider_label, payload)


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
            checkpoint_path = huggingface_hub.hf_hub_download(
                _MOLSCRIBE_HF_REPO,
                _MOLSCRIBE_HF_FILE,
            )
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


def _run_molecule_ocr_with_molscribe(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _MOLSCRIBE_API_URL:
        return {
            "status": "failed",
            "warnings": ["MolScribe endpoint is not configured."],
        }

    return _request_remote_molecule_provider(
        "MolScribe",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_MOLSCRIBE_API_URL,
        timeout_seconds=_MOLSCRIBE_TIMEOUT_SECONDS,
        api_key=_MOLSCRIBE_API_KEY or None,
    )


def _run_molecule_ocr_with_decimer(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _DECIMER_API_URL:
        return {
            "status": "failed",
            "warnings": ["DECIMER endpoint is not configured."],
        }

    return _request_remote_molecule_provider(
        "DECIMER",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_DECIMER_API_URL,
        timeout_seconds=_DECIMER_TIMEOUT_SECONDS,
        api_key=_DECIMER_API_KEY or None,
    )


def _run_molecule_ocr_with_molnextr(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _MOLNEXTR_API_URL:
        return {
            "status": "failed",
            "warnings": ["MolNexTR endpoint is not configured."],
        }

    return _request_remote_molecule_provider(
        "MolNexTR",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_MOLNEXTR_API_URL,
        timeout_seconds=_MOLNEXTR_TIMEOUT_SECONDS,
        api_key=_MOLNEXTR_API_KEY or None,
    )


def _run_molecule_ocr_with_provider(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if _MOLECULE_OCR_PROVIDER in {"", "placeholder", "disabled"}:
        return None

    if _MOLECULE_OCR_PROVIDER == "molscribe":
        return _run_molecule_ocr_with_molscribe(image_bytes, mime_type)
    if _MOLECULE_OCR_PROVIDER == "decimer":
        return _run_molecule_ocr_with_decimer(image_bytes, mime_type)
    if _MOLECULE_OCR_PROVIDER == "molnextr":
        return _run_molecule_ocr_with_molnextr(image_bytes, mime_type)

    return {
        "status": "failed",
        "warnings": [f"Unknown molecule OCR provider: {_MOLECULE_OCR_PROVIDER}"],
    }


def _extract_reaction_text_list(value: Any, *, text_key: str) -> list[str]:
    if not isinstance(value, list):
        return []

    items: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            items.append(item.strip())
            continue

        if not isinstance(item, dict):
            continue

        candidate = item.get(text_key)
        if isinstance(candidate, str) and candidate.strip():
            items.append(candidate.strip())
            continue
        if isinstance(candidate, list):
            items.extend(
                entry.strip()
                for entry in candidate
                if isinstance(entry, str) and entry.strip()
            )
            if items:
                continue

        fallback_text = item.get("text")
        if isinstance(fallback_text, str) and fallback_text.strip():
            items.append(fallback_text.strip())
        elif isinstance(fallback_text, list):
            items.extend(
                entry.strip()
                for entry in fallback_text
                if isinstance(entry, str) and entry.strip()
            )

    return items


def _map_remote_rxnscribe_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("status") == "failed":
        return {
            "status": "failed",
            "warnings": _normalize_warning_list(payload.get("warnings"))
            or ["RxnScribe remote provider returned failed status."],
        }

    normalized_reaction = payload.get("reaction")
    if isinstance(normalized_reaction, dict):
        reactants = _extract_reaction_text_list(
            normalized_reaction.get("reactants"),
            text_key="smiles",
        )
        products = _extract_reaction_text_list(
            normalized_reaction.get("products"),
            text_key="smiles",
        )
        conditions = _extract_reaction_text_list(
            normalized_reaction.get("conditions"),
            text_key="text",
        )
        if reactants and products:
            confidence = payload.get("confidence")
            return {
                "status": "ok",
                "reaction": {
                    "reactants": reactants,
                    "products": products,
                    "conditions": conditions,
                },
                "confidence": (
                    float(confidence) if isinstance(confidence, (int, float)) else None
                ),
                "warnings": _normalize_warning_list(payload.get("warnings")),
            }

    reactions = payload.get("reactions")
    if not isinstance(reactions, list):
        reactions = payload.get("predictions")

    if isinstance(reactions, list):
        for reaction in reactions:
            if not isinstance(reaction, dict):
                continue

            reactants = _extract_reaction_text_list(
                reaction.get("reactants"),
                text_key="smiles",
            )
            products = _extract_reaction_text_list(
                reaction.get("products"),
                text_key="smiles",
            )
            conditions = _extract_reaction_text_list(
                reaction.get("conditions"),
                text_key="text",
            )
            if reactants and products:
                confidence = payload.get("confidence")
                if not isinstance(confidence, (int, float)):
                    confidence = reaction.get("confidence")
                return {
                    "status": "ok",
                    "reaction": {
                        "reactants": reactants,
                    "products": products,
                    "conditions": conditions,
                },
                "confidence": (
                    float(confidence) if isinstance(confidence, (int, float)) else None
                ),
                "warnings": _normalize_warning_list(payload.get("warnings")),
            }

    return {
        "status": "failed",
        "warnings": _normalize_warning_list(payload.get("warnings"))
        or ["RxnScribe remote payload did not contain a usable reaction result."],
    }


def _request_remote_reaction_provider(
    provider_label: str,
    *,
    image_bytes: bytes,
    mime_type: str | None,
    api_url: str,
    timeout_seconds: int,
    api_key: str | None = None,
) -> dict[str, Any]:
    import base64

    payload = _request_remote_json(
        url=api_url,
        payload={
            "imageBase64": base64.b64encode(image_bytes).decode("utf-8"),
            "mimeType": mime_type or "image/png",
        },
        timeout_seconds=timeout_seconds,
        api_key=api_key,
    )
    if provider_label == "RxnScribe":
        return _map_remote_rxnscribe_payload(payload)

    return {
        "status": "failed",
        "warnings": _normalize_warning_list(payload.get("warnings"))
        or [f"{provider_label} remote mapping skeleton is reserved but not implemented yet."],
    }


def _run_reaction_ocr_with_rxnscribe(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _RXNSCRIBE_API_URL:
        return {
            "status": "failed",
            "warnings": ["RxnScribe endpoint is not configured."],
        }

    return _request_remote_reaction_provider(
        "RxnScribe",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_RXNSCRIBE_API_URL,
        timeout_seconds=_RXNSCRIBE_TIMEOUT_SECONDS,
        api_key=_RXNSCRIBE_API_KEY or None,
    )


def _run_reaction_ocr_with_rxnim(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _RXNIM_API_URL:
        return {
            "status": "failed",
            "warnings": ["RxnIM endpoint is not configured."],
        }

    return _request_remote_reaction_provider(
        "RxnIM",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_RXNIM_API_URL,
        timeout_seconds=_RXNIM_TIMEOUT_SECONDS,
        api_key=_RXNIM_API_KEY or None,
    )


def _run_reaction_ocr_with_rxncaption(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if not _RXNCAPTION_API_URL:
        return {
            "status": "failed",
            "warnings": ["RxnCaption endpoint is not configured."],
        }

    return _request_remote_reaction_provider(
        "RxnCaption",
        image_bytes=image_bytes,
        mime_type=mime_type,
        api_url=_RXNCAPTION_API_URL,
        timeout_seconds=_RXNCAPTION_TIMEOUT_SECONDS,
        api_key=_RXNCAPTION_API_KEY or None,
    )


def _run_reaction_ocr_with_provider(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    if _REACTION_OCR_PROVIDER in {"", "placeholder", "disabled"}:
        return None

    if _REACTION_OCR_PROVIDER == "rxnscribe":
        return _run_reaction_ocr_with_rxnscribe(image_bytes, mime_type)
    if _REACTION_OCR_PROVIDER == "rxnim":
        return _run_reaction_ocr_with_rxnim(image_bytes, mime_type)
    if _REACTION_OCR_PROVIDER == "rxncaption":
        return _run_reaction_ocr_with_rxncaption(image_bytes, mime_type)

    return {
        "status": "failed",
        "warnings": [f"Unknown reaction OCR provider: {_REACTION_OCR_PROVIDER}"],
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
    *,
    arrow_length: int = 48,
    component_gap: int = 16,
    plus_gap: int = 12,
    show_conditions_below_arrow: bool = True,
) -> str:
    reaction_label = f"{' + '.join(reactants)} -> {' + '.join(products)}"
    conditions_label = f"Conditions: {' | '.join(conditions)}" if conditions else ""
    conditions_position = "below" if show_conditions_below_arrow else "above"
    content_y = 74
    conditions_y = 108 if show_conditions_below_arrow else 34

    return "".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 140" role="img"',
            ' aria-label="Reaction fallback visualization"',
            f' data-arrow-length="{arrow_length}"',
            f' data-component-gap="{component_gap}"',
            f' data-plus-gap="{plus_gap}"',
            f' data-conditions-position="{conditions_position}">',
            '<rect x="1" y="1" width="538" height="138" rx="12" fill="#f8fafc" stroke="#cbd5e1"/>',
            f'<text x="20" y="{content_y}" font-size="20" fill="#0f172a">',
            f"{escape(reaction_label, quote=True)}</text>",
            f'<line x1="220" y1="{content_y - 8}" ',
            f'x2="{220 + arrow_length}" y2="{content_y - 8}" ',
            'stroke="#0f172a" stroke-width="2"/>',
            f'<polygon points="{220 + arrow_length},{content_y - 8} ',
            f'{220 + arrow_length - 10},{content_y - 14} ',
            f'{220 + arrow_length - 10},{content_y - 2}" fill="#0f172a"/>',
            f'<text x="20" y="{conditions_y}" font-size="14" fill="#475569">',
            f"{escape(conditions_label, quote=True)}</text>",
            "</svg>",
        ]
    )


def _coerce_string_list(value: Any, *, allow_empty: bool = False) -> list[str] | None:
    if not isinstance(value, list):
        return None
    if not value:
        return [] if allow_empty else None

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
    svg: str | None = None,
    arrow_length: int = 48,
    component_gap: int = 16,
    plus_gap: int = 12,
    show_conditions_below_arrow: bool = True,
    warnings: list[str] | None = None,
    renderer: str = "fallback",
) -> dict[str, Any]:
    return {
        "svg": svg
        or _build_reaction_fallback_svg(
            reactants,
            products,
            conditions,
            arrow_length=arrow_length,
            component_gap=component_gap,
            plus_gap=plus_gap,
            show_conditions_below_arrow=show_conditions_below_arrow,
        ),
        "renderer": renderer,
        "reaction": {
            "reactants": reactants,
            "products": products,
            "conditions": conditions,
        },
        "warnings": (
            warnings
            if warnings is not None
            else ["RDKit reaction render fallback is active."]
        ),
    }


def _clamp_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    if not isinstance(value, (int, float)):
        return default
    return max(minimum, min(int(value), maximum))


def _read_reaction_render_config(render_options: dict[str, Any] | None) -> dict[str, Any]:
    reaction_options = render_options.get("reaction") if isinstance(render_options, dict) else None
    if not isinstance(reaction_options, dict):
        reaction_options = {}

    return {
        "arrow_length": _clamp_int(reaction_options.get("arrowLength"), 48, 24, 180),
        "component_gap": _clamp_int(reaction_options.get("componentGap"), 16, 0, 64),
        "plus_gap": _clamp_int(reaction_options.get("plusGap"), 12, 0, 64),
        "show_conditions_below_arrow": (
            reaction_options.get("showConditionsBelowArrow")
            if isinstance(reaction_options.get("showConditionsBelowArrow"), bool)
            else True
        ),
    }


def _render_reaction(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fallback_config = _read_reaction_render_config(render_options)
    rdkit_payload = _render_reaction_with_rdkit(reactants, products, conditions, render_options)
    if rdkit_payload is not None:
        return rdkit_payload

    return _build_reaction_render_payload(reactants, products, conditions, **fallback_config)


def _try_import_rdkit() -> tuple[Any, Any, Any] | None:
    try:
        chem_module = importlib.import_module("rdkit.Chem")
        draw_module = importlib.import_module("rdkit.Chem.Draw.rdMolDraw2D")
        reactions_module = importlib.import_module("rdkit.Chem.rdChemReactions")
    except Exception:
        return None

    return chem_module, draw_module, reactions_module


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

    chem_module, _, _ = rdkit_modules
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

    chem_module, draw_module, _ = rdkit_modules
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


def _build_reaction_smiles(reactants: list[str], products: list[str]) -> str:
    return f"{'.'.join(reactants)}>>{'.'.join(products)}"


def _decorate_reaction_rdkit_svg(
    svg: str,
    *,
    conditions: list[str],
    arrow_length: int,
    component_gap: int,
    plus_gap: int,
    show_conditions_below_arrow: bool,
) -> str:
    decorated_svg = svg.replace(
        "<svg ",
        (
            '<svg role="img" aria-label="Reaction RDKit visualization"'
            f' data-arrow-length="{arrow_length}"'
            f' data-component-gap="{component_gap}"'
            f' data-plus-gap="{plus_gap}"'
            f' data-conditions-position="{"below" if show_conditions_below_arrow else "above"}" '
        ),
        1,
    )

    if not conditions or "</svg>" not in decorated_svg:
        return decorated_svg

    view_box_marker = 'viewBox="'
    if view_box_marker in decorated_svg:
        start = decorated_svg.index(view_box_marker) + len(view_box_marker)
        end = decorated_svg.index('"', start)
        view_box = decorated_svg[start:end].split()
    else:
        view_box = []

    height = 160.0
    if len(view_box) == 4:
        try:
            height = float(view_box[3])
        except ValueError:
            height = 160.0

    conditions_x = 16
    conditions_y = height - 12 if show_conditions_below_arrow else 20
    conditions_svg = (
        f'<text x="{conditions_x}" y="{conditions_y}" font-size="12" fill="#475569">'
        f'{escape("Conditions: " + " | ".join(conditions), quote=True)}</text>'
    )
    return decorated_svg.replace("</svg>", f"{conditions_svg}</svg>", 1)


def _render_reaction_with_rdkit(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    rdkit_modules = _try_import_rdkit()
    if rdkit_modules is None:
        return None

    _, draw_module, reactions_module = rdkit_modules
    try:
        reaction = reactions_module.ReactionFromSmarts(
            _build_reaction_smiles(reactants, products),
            useSmiles=True,
        )
    except Exception:
        return None

    if reaction is None:
        return None

    fallback_config = _read_reaction_render_config(render_options)
    try:
        drawer = draw_module.MolDraw2DSVG(540, 160)
        drawer.DrawReaction(reaction)
        drawer.FinishDrawing()
        svg = drawer.GetDrawingText()
    except Exception:
        return None

    return _build_reaction_render_payload(
        reactants,
        products,
        conditions,
        svg=_decorate_reaction_rdkit_svg(
            svg,
            conditions=conditions,
            **fallback_config,
        ),
        warnings=[],
        renderer="rdkit",
        **fallback_config,
    )


def _cache_key(document_id: str, block_id: str, session_id: str) -> str:
    return f"{session_id}::{document_id}::{block_id}"


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
    *,
    kind: str,
    document_id: str,
    block_id: str,
    session_id: str,
    source: str,
    confidence: float | None = None,
    smiles: str | None = None,
    molfile: str | None = None,
    reactants: list[str] | None = None,
    products: list[str] | None = None,
    conditions: list[str] | None = None,
    reaction_smiles: str | None = None,
    rxnfile: str | None = None,
) -> StructureRecord:
    _prune_cache()
    _enforce_cache_limit()
    now = _utcnow()
    record = StructureRecord(
        kind=kind,
        document_id=document_id,
        block_id=block_id,
        session_id=session_id,
        smiles=smiles,
        molfile=molfile,
        reactants=reactants,
        products=products,
        conditions=conditions,
        reaction_smiles=reaction_smiles,
        rxnfile=rxnfile,
        source=source,
        confidence=confidence,
        updated_at=now.isoformat(),
        expires_at=(now + timedelta(seconds=_CACHE_TTL_SECONDS)).isoformat(),
    )
    _CACHE[_cache_key(document_id, block_id, session_id)] = record
    return record


def _serialize_structure_record(record: StructureRecord) -> dict[str, Any]:
    base_payload: dict[str, Any] = {
        "kind": record.kind,
        "documentId": record.document_id,
        "blockId": record.block_id,
        "sessionId": record.session_id,
        "source": record.source,
        "confidence": record.confidence,
        "updatedAt": record.updated_at,
        "expiresAt": record.expires_at,
    }

    if record.kind == "reaction":
        base_payload.update(
            {
                "reactants": record.reactants or [],
                "products": record.products or [],
                "conditions": record.conditions or [],
                "reactionSmiles": record.reaction_smiles,
                "rxnfile": record.rxnfile,
            }
        )
    else:
        base_payload.update(
            {
                "smiles": record.smiles or "",
                "molfile": record.molfile,
            }
        )

    return base_payload


def _is_loopback_request() -> bool:
    candidate = request.remote_addr or ""
    normalized = candidate.lower()
    return normalized in {
        "127.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
        "localhost",
    } or normalized.startswith("127.")


@app.before_request
def _protect_internal_routes():
    if request.method == "OPTIONS" or request.path not in _PROTECTED_PATHS:
        return None

    if _CHEM_SERVICE_ACCESS_KEY:
        provided_key = request.headers.get("X-Chem-Service-Key", "").strip()
        if provided_key != _CHEM_SERVICE_ACCESS_KEY:
            return jsonify({"message": "chem-service access denied"}), 403
        return None

    if _CHEM_SERVICE_INTERNAL_ONLY and not _is_loopback_request():
        return jsonify({"message": "chem-service internal-only endpoint"}), 403

    return None


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
    if _MOLECULE_OCR_PROVIDER == "molscribe":
        configured = bool(_MOLSCRIBE_API_URL)
    elif _MOLECULE_OCR_PROVIDER == "decimer":
        configured = bool(_DECIMER_API_URL)
    elif _MOLECULE_OCR_PROVIDER == "molnextr":
        configured = bool(_MOLNEXTR_API_URL)
    elif _MOLECULE_OCR_PROVIDER in {"placeholder", "disabled", ""}:
        configured = False
    else:
        configured = False

    reaction_configured = False
    if _REACTION_OCR_PROVIDER == "rxnscribe":
        reaction_configured = bool(_RXNSCRIBE_API_URL)
    elif _REACTION_OCR_PROVIDER == "rxnim":
        reaction_configured = bool(_RXNIM_API_URL)
    elif _REACTION_OCR_PROVIDER == "rxncaption":
        reaction_configured = bool(_RXNCAPTION_API_URL)
    elif _REACTION_OCR_PROVIDER in {"placeholder", "disabled", ""}:
        reaction_configured = False
    else:
        reaction_configured = False

    return jsonify(
        {
            "status": "ok",
            "ocr": {
                "provider": _MOLECULE_OCR_PROVIDER or "placeholder",
                "configured": configured,
                "molecule": {
                    "provider": _MOLECULE_OCR_PROVIDER or "placeholder",
                    "configured": configured,
                },
                "reaction": {
                    "provider": _REACTION_OCR_PROVIDER or "placeholder",
                    "configured": reaction_configured,
                },
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
        "Molecule OCR provider is not enabled; placeholder structure was not persisted."
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
    image_base64, error = _extract_image_base64(payload)
    if error:
        return error

    if _REACTION_OCR_PROVIDER not in {"", "placeholder", "disabled"}:
        image_bytes = _decode_image_bytes(image_base64)
        if image_bytes is None:
            return jsonify({"message": "imageBase64 is invalid"}), 400

        mime_type = payload.get("mimeType")
        provider_payload = _run_reaction_ocr_with_provider(
            image_bytes,
            mime_type if isinstance(mime_type, str) else None,
        )
        if provider_payload is not None:
            return jsonify(provider_payload)

    return _placeholder_ocr_response(
        "Reaction OCR provider is not enabled; placeholder reaction was not persisted."
    )


@app.route("/reaction/render", methods=["POST", "OPTIONS"])
def reaction_render() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    reactants = _coerce_string_list(payload.get("reactants"), allow_empty=True)
    products = _coerce_string_list(payload.get("products"), allow_empty=True)
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
        _render_reaction(
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
        session_id = request.args.get("sessionId", type=str)
        if not document_id or not block_id or not session_id:
            return jsonify({"message": "documentId, blockId, and sessionId are required"}), 400

        record = _CACHE.get(_cache_key(document_id, block_id, session_id))
        if not record:
            return jsonify({"found": False})

        return jsonify(
            {
                "found": True,
                "record": _serialize_structure_record(record),
            }
        )

    payload = request.get_json(silent=True) or {}
    kind = payload.get("kind", "molecule")
    document_id = payload.get("documentId")
    block_id = payload.get("blockId")
    session_id = payload.get("sessionId")
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")
    reactants = payload.get("reactants")
    products = payload.get("products")
    conditions = payload.get("conditions")
    reaction_smiles = payload.get("reactionSmiles")
    rxnfile = payload.get("rxnfile")
    source = payload.get("source", "manual")
    confidence = payload.get("confidence")

    if (
        not isinstance(document_id, str)
        or not isinstance(block_id, str)
        or not isinstance(session_id, str)
    ):
        return jsonify({"message": "documentId, blockId, and sessionId are required"}), 400

    if kind == "reaction":
        normalized_reactants = _coerce_string_list(reactants, allow_empty=True)
        normalized_products = _coerce_string_list(products, allow_empty=True)
        if normalized_reactants is None or normalized_products is None:
            return jsonify({"message": "reactants and products are required"}), 400

        if conditions is None:
            normalized_conditions = []
        else:
            normalized_conditions = _coerce_string_list(conditions) or []
            if isinstance(conditions, list) and len(conditions) > 0 and not normalized_conditions:
                return jsonify({"message": "conditions must be a non-empty string array"}), 400

        conf = float(confidence) if isinstance(confidence, (int, float)) else None
        record = _save_cache(
            kind="reaction",
            document_id=document_id,
            block_id=block_id,
            session_id=session_id,
            reactants=normalized_reactants,
            products=normalized_products,
            conditions=normalized_conditions,
            reaction_smiles=reaction_smiles if isinstance(reaction_smiles, str) else None,
            rxnfile=rxnfile if isinstance(rxnfile, str) else None,
            smiles=None,
            molfile=None,
            source=source if isinstance(source, str) else "manual",
            confidence=conf,
        )
        return jsonify(_serialize_structure_record(record))

    if not isinstance(smiles, str) or not smiles.strip():
        return jsonify({"message": "smiles is required"}), 400

    conf = float(confidence) if isinstance(confidence, (int, float)) else None
    record = _save_cache(
        kind="molecule",
        document_id=document_id,
        block_id=block_id,
        session_id=session_id,
        smiles=smiles.strip(),
        molfile=molfile if isinstance(molfile, str) else None,
        reactants=None,
        products=None,
        conditions=None,
        reaction_smiles=None,
        rxnfile=None,
        source=source if isinstance(source, str) else "manual",
        confidence=conf,
    )

    return jsonify(_serialize_structure_record(record))


def main() -> None:
    """Run chem-service development server."""
    app.run(
        host=os.environ.get("CHEM_SERVICE_HOST", "127.0.0.1"),
        port=_read_int_env("CHEM_SERVICE_PORT", 18081),
    )


if __name__ == "__main__":
    main()

