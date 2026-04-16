from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ProviderConfig:
    key: str
    label: str
    api_url: str
    timeout_seconds: int
    api_key: str | None = None


@dataclass(frozen=True, slots=True)
class ProviderDispatchRequest:
    image_bytes: bytes
    mime_type: str | None


def build_registry(*configs: ProviderConfig) -> dict[str, ProviderConfig]:
    return {config.key: config for config in configs}


def is_provider_disabled(provider_key: str) -> bool:
    return provider_key in {"", "placeholder", "disabled"}


def read_provider_health(
    provider_key: str,
    registry: dict[str, ProviderConfig],
) -> dict[str, Any]:
    config = registry.get(provider_key)
    return {
        "provider": provider_key or "placeholder",
        "configured": bool(config and config.api_url),
    }


def dispatch_provider(
    *,
    provider_key: str,
    registry: dict[str, ProviderConfig],
    runners: dict[str, Callable[[ProviderConfig, ProviderDispatchRequest], dict[str, Any] | None]],
    request: ProviderDispatchRequest,
    unknown_warning: str,
) -> dict[str, Any] | None:
    if is_provider_disabled(provider_key):
        return None

    runner = runners.get(provider_key)
    config = registry.get(provider_key)
    if runner is None or config is None:
        return {
            "status": "failed",
            "warnings": [unknown_warning.format(provider=provider_key)],
        }

    return runner(config, request)
