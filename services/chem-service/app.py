"""chem-service 的 OCR / normalize / render 最小路由实现。"""

from __future__ import annotations

import binascii
import importlib
import logging
import os
from typing import Any
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError

from flask import Flask, jsonify, request

import chem_service.molecule_ocr as molecule_ocr
import chem_service.molecule_rendering as molecule_rendering
import chem_service.provider_registry as provider_registry
import chem_service.reaction_ocr as reaction_ocr_module
import chem_service.reaction_rendering as reaction_rendering
import chem_service.remote_provider as remote_provider
import chem_service.structure_handlers as structure_handlers
import chem_service.structure_models as structure_models
import chem_service.structure_store as structure_store

StructureRecord = structure_store.StructureRecord
_CACHE = structure_store._CACHE
LOGGER = logging.getLogger(__name__)


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
_RDKIT_MODULES: tuple[Any, Any, Any] | None = None
_RDKIT_IMPORT_FAILED = False


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
    except (binascii.Error, ValueError):
        return None


def _complete_service_payload(
    payload: dict[str, Any],
    *,
    kind: str,
    provider: str,
    placeholder: bool = False,
    normalized: dict[str, Any] | None = None,
) -> dict[str, Any]:
    completed = dict(payload)
    completed.setdefault("kind", kind)
    completed.setdefault("provider", provider)
    completed.setdefault("placeholder", placeholder)
    completed.setdefault("candidates", [])
    if normalized is not None:
        completed.setdefault("normalized", normalized)
    return completed


def _complete_molecule_payload(
    payload: dict[str, Any],
    *,
    provider: str,
    placeholder: bool = False,
) -> dict[str, Any]:
    structure = payload.get("structure")
    normalized = structure if isinstance(structure, dict) else None
    completed = _complete_service_payload(
        payload,
        kind="molecule",
        provider=provider,
        placeholder=placeholder,
        normalized=normalized,
    )
    if not completed["candidates"] and normalized is not None:
        completed["candidates"] = [
            {
                "provider": completed["provider"],
                "structure": normalized,
                "confidence": completed.get("confidence"),
            }
        ]
    return completed


def _complete_reaction_payload(
    payload: dict[str, Any],
    *,
    provider: str,
    placeholder: bool = False,
) -> dict[str, Any]:
    reaction = payload.get("reaction")
    normalized = reaction if isinstance(reaction, dict) else None
    completed = _complete_service_payload(
        payload,
        kind="reaction",
        provider=provider,
        placeholder=placeholder,
        normalized=normalized,
    )
    if not completed["candidates"] and normalized is not None:
        completed["candidates"] = [
            {
                "provider": completed["provider"],
                "reaction": normalized,
                "confidence": completed.get("confidence"),
            }
        ]
    return completed


def _placeholder_ocr_response(message: str, *, kind: str) -> Any:
    return jsonify(
        {
            "status": "failed",
            "kind": kind,
            "provider": "placeholder",
            "candidates": [],
            "placeholder": True,
            "warnings": [message],
        }
    )


def _request_remote_json(
    *,
    url: str,
    payload: dict[str, Any],
    timeout_seconds: int,
    api_key: str | None = None,
) -> dict[str, Any]:
    # 统一从这一层注入网络 transport，避免下游请求分支各自拼装 urllib 细节。
    return remote_provider._request_remote_json(
        remote_provider.RemoteJsonRequest(
            url=url,
            payload=payload,
            timeout_seconds=timeout_seconds,
            api_key=api_key,
        ),
        transport=remote_provider.RemoteJsonTransport(
            request_builder=urllib_request.Request,
            urlopen=urllib_request.urlopen,
            http_error_cls=HTTPError,
            url_error_cls=URLError,
        ),
    )


def _build_molecule_provider_registry() -> dict[str, provider_registry.ProviderConfig]:
    return provider_registry.build_registry(
        provider_registry.ProviderConfig(
            key="molscribe",
            label="MolScribe",
            api_url=_MOLSCRIBE_API_URL,
            timeout_seconds=_MOLSCRIBE_TIMEOUT_SECONDS,
            api_key=_MOLSCRIBE_API_KEY or None,
        ),
        provider_registry.ProviderConfig(
            key="decimer",
            label="DECIMER",
            api_url=_DECIMER_API_URL,
            timeout_seconds=_DECIMER_TIMEOUT_SECONDS,
            api_key=_DECIMER_API_KEY or None,
        ),
        provider_registry.ProviderConfig(
            key="molnextr",
            label="MolNexTR",
            api_url=_MOLNEXTR_API_URL,
            timeout_seconds=_MOLNEXTR_TIMEOUT_SECONDS,
            api_key=_MOLNEXTR_API_KEY or None,
        ),
    )


def _run_named_molecule_ocr_provider(
    provider_key: str,
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    config = _build_molecule_provider_registry()[provider_key]
    if not config.api_url:
        return {
            "status": "failed",
            "warnings": [f"{config.label} endpoint is not configured."],
        }

    return molecule_ocr._request_remote_molecule_provider(
        config.label,
        remote_provider.RemoteOcrProviderRequest(
            image_bytes=image_bytes,
            mime_type=mime_type,
            api_url=config.api_url,
            timeout_seconds=config.timeout_seconds,
            api_key=config.api_key,
        ),
        request_remote_json=_request_remote_json,
    )


def _run_molecule_ocr_with_molscribe(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_molecule_ocr_provider("molscribe", image_bytes, mime_type)


def _run_molecule_ocr_with_decimer(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_molecule_ocr_provider("decimer", image_bytes, mime_type)


def _run_molecule_ocr_with_molnextr(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_molecule_ocr_provider("molnextr", image_bytes, mime_type)


def _run_molecule_ocr_with_provider(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return provider_registry.dispatch_provider(
        provider_key=_MOLECULE_OCR_PROVIDER,
        registry=_build_molecule_provider_registry(),
        runners={
            "molscribe": lambda _config, request: _run_molecule_ocr_with_molscribe(
                request.image_bytes,
                request.mime_type,
            ),
            "decimer": lambda _config, request: _run_molecule_ocr_with_decimer(
                request.image_bytes,
                request.mime_type,
            ),
            "molnextr": lambda _config, request: _run_molecule_ocr_with_molnextr(
                request.image_bytes,
                request.mime_type,
            ),
        },
        request=provider_registry.ProviderDispatchRequest(
            image_bytes=image_bytes,
            mime_type=mime_type,
        ),
        unknown_warning="Unknown molecule OCR provider: {provider}",
    )


def _build_reaction_provider_registry() -> dict[str, provider_registry.ProviderConfig]:
    return provider_registry.build_registry(
        provider_registry.ProviderConfig(
            key="rxnscribe",
            label="RxnScribe",
            api_url=_RXNSCRIBE_API_URL,
            timeout_seconds=_RXNSCRIBE_TIMEOUT_SECONDS,
            api_key=_RXNSCRIBE_API_KEY or None,
        ),
        provider_registry.ProviderConfig(
            key="rxnim",
            label="RxnIM",
            api_url=_RXNIM_API_URL,
            timeout_seconds=_RXNIM_TIMEOUT_SECONDS,
            api_key=_RXNIM_API_KEY or None,
        ),
        provider_registry.ProviderConfig(
            key="rxncaption",
            label="RxnCaption",
            api_url=_RXNCAPTION_API_URL,
            timeout_seconds=_RXNCAPTION_TIMEOUT_SECONDS,
            api_key=_RXNCAPTION_API_KEY or None,
        ),
    )


def _run_named_reaction_ocr_provider(
    provider_key: str,
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    config = _build_reaction_provider_registry()[provider_key]
    if not config.api_url:
        return {
            "status": "failed",
            "warnings": [f"{config.label} endpoint is not configured."],
        }

    return reaction_ocr_module._request_remote_reaction_provider(
        config.label,
        remote_provider.RemoteOcrProviderRequest(
            image_bytes=image_bytes,
            mime_type=mime_type,
            api_url=config.api_url,
            timeout_seconds=config.timeout_seconds,
            api_key=config.api_key,
        ),
        request_remote_json=_request_remote_json,
    )


def _run_reaction_ocr_with_rxnscribe(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_reaction_ocr_provider("rxnscribe", image_bytes, mime_type)


def _run_reaction_ocr_with_rxnim(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_reaction_ocr_provider("rxnim", image_bytes, mime_type)


def _run_reaction_ocr_with_rxncaption(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return _run_named_reaction_ocr_provider("rxncaption", image_bytes, mime_type)


def _run_reaction_ocr_with_provider(
    image_bytes: bytes,
    mime_type: str | None,
) -> dict[str, Any] | None:
    return provider_registry.dispatch_provider(
        provider_key=_REACTION_OCR_PROVIDER,
        registry=_build_reaction_provider_registry(),
        runners={
            "rxnscribe": lambda _config, request: _run_reaction_ocr_with_rxnscribe(
                request.image_bytes,
                request.mime_type,
            ),
            "rxnim": lambda _config, request: _run_reaction_ocr_with_rxnim(
                request.image_bytes,
                request.mime_type,
            ),
            "rxncaption": lambda _config, request: _run_reaction_ocr_with_rxncaption(
                request.image_bytes,
                request.mime_type,
            ),
        },
        request=provider_registry.ProviderDispatchRequest(
            image_bytes=image_bytes,
            mime_type=mime_type,
        ),
        unknown_warning="Unknown reaction OCR provider: {provider}",
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


def _try_import_rdkit() -> tuple[Any, Any, Any] | None:
    global _RDKIT_MODULES
    global _RDKIT_IMPORT_FAILED

    if _RDKIT_MODULES is not None:
        return _RDKIT_MODULES
    if _RDKIT_IMPORT_FAILED:
        return None

    try:
        chem_module = importlib.import_module("rdkit.Chem")
        draw_module = importlib.import_module("rdkit.Chem.Draw.rdMolDraw2D")
        reactions_module = importlib.import_module("rdkit.Chem.rdChemReactions")
    except Exception as error:
        _RDKIT_IMPORT_FAILED = True
        LOGGER.info("RDKit import unavailable, chem-service will use fallback paths: %s", error)
        return None

    _RDKIT_MODULES = (chem_module, draw_module, reactions_module)
    return _RDKIT_MODULES


def _normalize_with_rdkit(smiles: str | None, molfile: str | None) -> dict[str, Any] | None:
    return molecule_rendering._normalize_with_rdkit(
        smiles,
        molfile,
        try_import_rdkit=_try_import_rdkit,
    )


def _render_with_rdkit(
    smiles: str | None,
    molfile: str | None,
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return molecule_rendering._render_with_rdkit(
        smiles,
        molfile,
        render_options,
        try_import_rdkit=_try_import_rdkit,
    )


def _render_reaction_with_rdkit(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    return reaction_rendering._render_reaction_with_rdkit(
        reactants,
        products,
        conditions,
        render_options,
        try_import_rdkit=_try_import_rdkit,
    )


def _render_reaction(
    reactants: list[str],
    products: list[str],
    conditions: list[str],
    render_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rendered = _render_reaction_with_rdkit(
        reactants,
        products,
        conditions,
        render_options,
    )
    if rendered is not None:
        return rendered

    return reaction_rendering._build_reaction_render_payload(
        reaction_rendering.ReactionRenderInput(
            reactants=reactants,
            products=products,
            conditions=conditions,
        ),
        render_config=reaction_rendering._read_reaction_render_config(render_options),
    )


def _cache_key(document_id: str, block_id: str, session_id: str) -> str:
    return structure_store._cache_key(document_id, block_id, session_id)


def _prune_cache() -> None:
    structure_store._prune_cache(cache=_CACHE)


def _save_cache(
    request_model: structure_models.StructureSaveRequest,
) -> StructureRecord:
    return structure_store._save_cache(
        cache=_CACHE,
        ttl_seconds=_CACHE_TTL_SECONDS,
        max_entries=_CACHE_MAX_ENTRIES,
        request=request_model,
    )


def _serialize_structure_record(record: StructureRecord) -> dict[str, Any]:
    return structure_store._serialize_structure_record(record)


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
        # 配置 access key 后优先校验显式 header，避免把内部接口绑定到 loopback 假设。
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
        # 只对白名单 origin 回写 CORS，避免内部接口变成通用跨域入口。
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return response


@app.route("/healthz", methods=["GET"])
def healthz() -> Any:
    molecule_health = provider_registry.read_provider_health(
        _MOLECULE_OCR_PROVIDER,
        _build_molecule_provider_registry(),
    )
    reaction_health = provider_registry.read_provider_health(
        _REACTION_OCR_PROVIDER,
        _build_reaction_provider_registry(),
    )

    return jsonify(
        {
            "status": "ok",
            "ocr": {
                "provider": molecule_health["provider"],
                "configured": molecule_health["configured"],
                "molecule": molecule_health,
                "reaction": reaction_health,
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
        return jsonify(
            _complete_molecule_payload(provider_payload, provider=_MOLECULE_OCR_PROVIDER)
        )

    return _placeholder_ocr_response(
        "Molecule OCR provider is not enabled; placeholder structure was not persisted.",
        kind="molecule",
    )


@app.route("/normalize", methods=["POST", "OPTIONS"])
def normalize() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    payload = request.get_json(silent=True) or {}
    smiles = payload.get("smiles")
    molfile = payload.get("molfile")
    normalized_smiles = smiles.strip() if isinstance(smiles, str) and smiles.strip() else None
    normalized_molfile = molfile if isinstance(molfile, str) and molfile.strip() else None

    if not normalized_smiles and not normalized_molfile:
        return jsonify({"message": "smiles or molfile is required"}), 400

    rdkit_payload = _normalize_with_rdkit(normalized_smiles, normalized_molfile)
    if rdkit_payload is not None:
        return jsonify(
            _complete_service_payload(
                rdkit_payload,
                kind="molecule",
                provider="rdkit",
                normalized={
                    "canonicalSmiles": rdkit_payload.get("canonicalSmiles"),
                    "normalizedMolfile": rdkit_payload.get("normalizedMolfile"),
                },
            )
        )

    return jsonify(
        {
            "kind": "molecule",
            "provider": "fallback",
            "candidates": [],
            "placeholder": False,
            "canonicalSmiles": normalized_smiles or "",
            "normalizedMolfile": normalized_molfile or None,
            "normalized": {
                "canonicalSmiles": normalized_smiles or "",
                "normalizedMolfile": normalized_molfile or None,
            },
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
    render_options = payload.get("renderOptions")
    normalized_smiles = smiles.strip() if isinstance(smiles, str) and smiles.strip() else None
    normalized_molfile = molfile if isinstance(molfile, str) and molfile.strip() else None

    if not normalized_smiles and not normalized_molfile:
        return jsonify({"message": "smiles or molfile is required"}), 400

    rdkit_payload = _render_with_rdkit(
        normalized_smiles,
        normalized_molfile,
        render_options if isinstance(render_options, dict) else None,
    )
    if rdkit_payload is not None:
        return jsonify(
            _complete_service_payload(
                rdkit_payload,
                kind="molecule",
                provider="rdkit",
                normalized={
                    "canonicalSmiles": rdkit_payload.get("canonicalSmiles"),
                    "normalizedMolfile": rdkit_payload.get("normalizedMolfile"),
                },
            )
        )

    display = normalized_smiles or normalized_molfile or "structure"
    svg = molecule_rendering._build_molecule_fallback_svg(display)

    return jsonify(
        {
            "kind": "molecule",
            "provider": "fallback",
            "candidates": [],
            "placeholder": False,
            "svg": svg,
            "canonicalSmiles": normalized_smiles or "",
            "normalizedMolfile": normalized_molfile or None,
            "normalized": {
                "canonicalSmiles": normalized_smiles or "",
                "normalizedMolfile": normalized_molfile or None,
            },
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
            return jsonify(
                _complete_reaction_payload(provider_payload, provider=_REACTION_OCR_PROVIDER)
            )

    return _placeholder_ocr_response(
        "Reaction OCR provider is not enabled; placeholder reaction was not persisted.",
        kind="reaction",
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
    elif not isinstance(conditions, list):
        return jsonify({"message": "conditions must be a string array"}), 400
    else:
        normalized_conditions = _coerce_string_list(conditions) or []
        if len(conditions) > 0 and not normalized_conditions:
            return jsonify({"message": "conditions must be a non-empty string array"}), 400

    rendered = _render_reaction(
        reactants,
        products,
        normalized_conditions,
        render_options if isinstance(render_options, dict) else None,
    )
    return jsonify(
        _complete_reaction_payload(rendered, provider=rendered.get("renderer", "fallback"))
    )


@app.route("/structure", methods=["GET", "POST", "OPTIONS"])
def structure() -> Any:
    if request.method == "OPTIONS":
        return ("", 204)

    if request.method == "GET":
        return structure_handlers._handle_structure_get_request(
            structure_handlers.StructureReadContext(
                request_obj=request,
                jsonify=jsonify,
                cache=_CACHE,
                cache_key=_cache_key,
                prune_cache=_prune_cache,
                serialize_structure_record=_serialize_structure_record,
            )
        )

    return structure_handlers._handle_structure_post_request(
        structure_handlers.StructureWriteContext(
            request_obj=request,
            jsonify=jsonify,
            coerce_string_list=_coerce_string_list,
            save_cache=_save_cache,
            serialize_structure_record=_serialize_structure_record,
        )
    )


def main() -> None:
    """启动 chem-service 本地开发服务。"""
    app.run(
        host=os.environ.get("CHEM_SERVICE_HOST", "127.0.0.1"),
        port=_read_int_env("CHEM_SERVICE_PORT", 18081),
    )


if __name__ == "__main__":
    main()
