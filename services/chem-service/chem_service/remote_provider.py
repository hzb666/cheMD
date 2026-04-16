from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class RemoteJsonRequest:
    url: str
    payload: dict[str, Any]
    timeout_seconds: int
    api_key: str | None = None


@dataclass(frozen=True, slots=True)
class RemoteJsonTransport:
    request_builder: Callable[..., Any]
    urlopen: Callable[..., Any]
    http_error_cls: type[BaseException]
    url_error_cls: type[BaseException]


@dataclass(frozen=True, slots=True)
class RemoteOcrProviderRequest:
    image_bytes: bytes
    mime_type: str | None
    api_url: str
    timeout_seconds: int
    api_key: str | None = None


def _request_remote_json(
    request: RemoteJsonRequest,
    *,
    transport: RemoteJsonTransport,
) -> dict[str, Any]:
    # 远端 OCR 请求统一使用 JSON POST，并在此层注入 API key。
    headers = {
        "Content-Type": "application/json",
    }
    if request.api_key:
        headers["X-Api-Key"] = request.api_key

    request_obj = transport.request_builder(
        request.url,
        data=json.dumps(request.payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with transport.urlopen(request_obj, timeout=request.timeout_seconds) as response:
            body = response.read().decode("utf-8")
    except transport.http_error_cls as error:
        # 异常优先携带 provider 返回体，便于上层输出可诊断 warning。
        body = error.read().decode("utf-8", errors="ignore")
        reason = body or getattr(error, "reason", "unknown error")
        raise RuntimeError(
            f"Remote OCR request failed ({getattr(error, 'code', 'unknown')}): {reason}"
        ) from error
    except transport.url_error_cls as error:
        raise RuntimeError(
            f"Remote OCR request failed: {getattr(error, 'reason', error)}"
        ) from error

    try:
        parsed_payload = json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError("Remote OCR provider returned invalid JSON") from error

    if not isinstance(parsed_payload, dict):
        raise RuntimeError("Remote OCR provider returned a non-object payload")

    return parsed_payload


def _normalize_warning_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item.strip() for item in value if isinstance(item, str) and item.strip()]
