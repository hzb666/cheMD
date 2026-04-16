from __future__ import annotations

from collections.abc import Callable
from typing import Any

from chem_service.remote_provider import (
    RemoteOcrProviderRequest,
    _normalize_warning_list,
)


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
                entry.strip() for entry in candidate if isinstance(entry, str) and entry.strip()
            )
            if items:
                continue

        fallback_text = item.get("text")
        if isinstance(fallback_text, str) and fallback_text.strip():
            items.append(fallback_text.strip())
        elif isinstance(fallback_text, list):
            items.extend(
                entry.strip() for entry in fallback_text if isinstance(entry, str) and entry.strip()
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
                "confidence": (float(confidence) if isinstance(confidence, (int, float)) else None),
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
    if provider_label == "RxnScribe":
        return _map_remote_rxnscribe_payload(payload)

    return {
        "status": "failed",
        "warnings": _normalize_warning_list(payload.get("warnings"))
        or [f"{provider_label} remote mapping skeleton is reserved but not implemented yet."],
    }
