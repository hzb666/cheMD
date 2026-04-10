from __future__ import annotations

from collections.abc import Callable
from typing import Any

from chem_service.remote_provider import (
    RemoteOcrProviderRequest,
    _normalize_warning_list,
)


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


def _select_remote_molecule_fields(
    provider_label: str,
    payload: dict[str, Any],
) -> tuple[Any, Any]:
    if provider_label == "MolNexTR":
        return payload.get("predicted_smiles"), payload.get("predicted_molfile")
    if provider_label == "DECIMER":
        return payload.get("smiles") or payload.get("SMILES"), payload.get("molfile")
    return payload.get("smiles"), payload.get("molfile")


def _extract_remote_structure_string(
    value: Any,
    *,
    strip_value: bool = True,
) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip() if strip_value else value


def _normalize_remote_molecule_structure(
    raw_smiles: Any,
    raw_molfile: Any,
    structure: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    smiles = _extract_remote_structure_string(raw_smiles)
    if smiles is None and isinstance(structure, dict):
        smiles = _extract_remote_structure_string(structure.get("smiles"))

    molfile = _extract_remote_structure_string(raw_molfile, strip_value=False)
    if molfile is None and isinstance(structure, dict):
        molfile = _extract_remote_structure_string(
            structure.get("molfile"),
            strip_value=False,
        )

    return smiles, molfile


def _map_remote_molecule_payload(
    provider_label: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if payload.get("status") == "failed":
        return {
            "status": "failed",
            "warnings": _normalize_warning_list(payload.get("warnings"))
            or [f"{provider_label} remote provider returned failed status."],
        }

    structure = payload.get("structure") if isinstance(payload.get("structure"), dict) else None
    raw_smiles, raw_molfile = _select_remote_molecule_fields(provider_label, payload)
    smiles, molfile = _normalize_remote_molecule_structure(raw_smiles, raw_molfile, structure)

    confidence = payload.get("confidence")
    normalized_confidence = float(confidence) if isinstance(confidence, (int, float)) else None
    warnings = _normalize_warning_list(payload.get("warnings"))

    if not smiles and not molfile:
        return {
            "status": "failed",
            "warnings": (
                warnings or [f"{provider_label} remote payload did not contain a structure result."]
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
    request: RemoteOcrProviderRequest,
    *,
    request_remote_json: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    import base64

    payload = request_remote_json(
        url=request.api_url,
        payload={
            "imageBase64": base64.b64encode(request.image_bytes).decode("utf-8"),
            "mimeType": request.mime_type or "image/png",
        },
        timeout_seconds=request.timeout_seconds,
        api_key=request.api_key,
    )
    return _map_remote_molecule_payload(provider_label, payload)
