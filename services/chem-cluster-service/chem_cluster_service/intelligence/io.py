from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypedDict


class ClassifiedEnvelope(TypedDict, total=False):
    status: str
    code: str
    message: str
    artifact: dict[str, Any] | None
    errors: list[str]


class IntelligenceIOError(ValueError):
    """Raised when intelligence JSON IO cannot produce a valid object."""

    def __init__(self, code: str, message: str, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.errors = errors or []

    def envelope(self) -> ClassifiedEnvelope:
        return validation_envelope(self.code, str(self), self.errors)


def validation_envelope(code: str, message: str, errors: list[str] | None = None) -> ClassifiedEnvelope:
    envelope: ClassifiedEnvelope = {
        "status": "ERROR",
        "code": code,
        "message": message,
        "artifact": None,
    }
    if errors:
        envelope["errors"] = errors
    return envelope


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise IntelligenceIOError("input_read_failed", str(error)) from error
    except json.JSONDecodeError as error:
        raise IntelligenceIOError("invalid_json", f"invalid JSON: {error.msg}") from error
    if not isinstance(value, dict):
        raise IntelligenceIOError("invalid_input", "input JSON must be an object")
    return value


def write_json(path: Path, payload: dict[str, Any], pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2 if pretty else None, sort_keys=True) + "\n",
        encoding="utf-8",
    )
