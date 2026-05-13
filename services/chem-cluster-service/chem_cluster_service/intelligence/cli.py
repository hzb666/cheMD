from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from chem_cluster_service.intelligence.contracts import PROVIDER_KINDS, ProviderKind
from chem_cluster_service.intelligence.io import IntelligenceIOError, read_json, validation_envelope, write_json
from chem_cluster_service.intelligence.pipeline import ProviderFactory, run_reaction_intelligence_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chemd reaction intelligence worker pipeline")
    parser.add_argument("--input", required=True, help="Reaction intelligence job JSON path")
    parser.add_argument("--output", help="Output artifact JSON path. Defaults to stdout")
    parser.add_argument("--providers", nargs="+", help="Provider list, comma or space separated")
    parser.add_argument("--missing-dependency", choices=["skip", "error", "fallback"], help="Missing dependency policy")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    return parser


def main(argv: list[str] | None = None, *, provider_factory: ProviderFactory | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = read_json(Path(args.input))
        _apply_cli_overrides(payload, args.providers, args.missing_dependency)
        result = run_reaction_intelligence_pipeline(payload, provider_factory=provider_factory)
        _emit(result.payload, args.output, args.pretty)
        return result.exit_code
    except IntelligenceIOError as error:
        _emit(error.envelope(), args.output, args.pretty)
        return 1
    except ValueError as error:
        _emit(validation_envelope("invalid_cli_argument", str(error)), args.output, args.pretty)
        return 1


def _apply_cli_overrides(
    payload: dict[str, Any],
    providers: list[str] | None,
    missing_dependency: str | None,
) -> None:
    if providers:
        payload["requested_providers"] = _parse_providers(providers)
    if missing_dependency is not None:
        policy = payload.get("provider_policy")
        if not isinstance(policy, dict):
            raise ValueError("provider_policy is required to override missing_dependency")
        policy["missing_dependency"] = missing_dependency


def _parse_providers(values: list[str]) -> list[ProviderKind]:
    providers: list[str] = []
    for value in values:
        providers.extend(item.strip() for item in value.split(","))
    normalized = [item for item in providers if item]
    invalid = [item for item in normalized if item not in PROVIDER_KINDS]
    if invalid:
        raise ValueError("providers contains invalid provider: " + ", ".join(invalid))
    return normalized  # type: ignore[return-value]


def _emit(payload: dict[str, Any], output: str | None, pretty: bool) -> None:
    if output:
        write_json(Path(output), payload, pretty)
        return
    print(json.dumps(payload, indent=2 if pretty else None, sort_keys=True))


if __name__ == "__main__":
    raise SystemExit(main())
