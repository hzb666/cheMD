from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from chem_service.reaction_intelligence.providers.tmap_layout import build_tmap_layout

ARTIFACT_SCHEMA_VERSION = "chemd-reaction-intelligence-artifact/v0.1"


def build_artifact(job: dict[str, Any]) -> dict[str, Any]:
    layout_result = build_tmap_layout(job)
    layout = _artifact_layout(layout_result)

    return {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "artifact_id": _artifact_id(job),
        "job_id": _job_id(job),
        "provider_statuses": [_provider_status(layout_result["provider"])],
        "computed_features": [],
        "computed_similarity_edges": [],
        **({"layout": layout} if layout is not None else {}),
        "warnings": layout_result["warnings"],
        "diagnostics": {
            "reactionCount": _reaction_count(job, layout_result),
            "layoutCount": 1 if layout is not None else 0,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    try:
        job = _read_job(args.job)
        artifact = build_artifact(job)
    except ValueError as exc:
        artifact = _failure_artifact(str(exc))
        _write_artifact(artifact, args.output)
        return 2

    _write_artifact(artifact, args.output)
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="chemd-reaction-intelligence",
        description="Run optional reaction intelligence providers against a JSON job.",
    )
    parser.add_argument("job", type=Path, help="Path to a ReactionIntelligenceJob JSON file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Optional artifact JSON output path. Defaults to stdout.",
    )
    return parser


def _read_job(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ValueError(f"Unable to read job file: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid job JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise ValueError("Reaction intelligence job must be a JSON object.")
    return payload


def _write_artifact(artifact: dict[str, Any], output_path: Path | None) -> None:
    payload = json.dumps(artifact, ensure_ascii=False, indent=2, sort_keys=True)
    if output_path is None:
        print(payload)
        return
    output_path.write_text(payload + "\n", encoding="utf-8")


def _failure_artifact(message: str) -> dict[str, Any]:
    return {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "artifact_id": "reaction-intelligence::invalid-job",
        "job_id": None,
        "provider_statuses": [
            {
                "provider": "tmap_layout",
                "status": "ERROR",
                "reason_code": "invalid_job",
                "message": message,
                "warnings": [message],
            }
        ],
        "computed_features": [],
        "computed_similarity_edges": [],
        "warnings": [message],
        "diagnostics": {"reactionCount": 0, "layoutCount": 0},
    }


def _reaction_count(job: dict[str, Any], layout_result: dict[str, Any]) -> int:
    layout = layout_result.get("layout")
    if isinstance(layout, dict):
        diagnostics = layout.get("diagnostics")
        if isinstance(diagnostics, dict) and isinstance(diagnostics.get("reactionCount"), int):
            return diagnostics["reactionCount"]
    reaction_ids = job.get("reactionIds")
    if isinstance(reaction_ids, list):
        return len({reaction_id for reaction_id in reaction_ids if isinstance(reaction_id, str)})
    reactions = job.get("reactions")
    if isinstance(reactions, list):
        return len(reactions)
    return 0


def _job_id(job: dict[str, Any]) -> str | None:
    value = job.get("job_id") or job.get("jobId")
    return value if isinstance(value, str) else None


def _artifact_id(job: dict[str, Any]) -> str:
    return f"reaction-intelligence::{_job_id(job) or 'anonymous-job'}"


def _provider_status(provider: dict[str, Any]) -> dict[str, Any]:
    status = provider.get("status")
    return {
        "provider": "tmap_layout",
        "status": "OK" if status == "computed" else "SKIP",
        "reason_code": provider.get("reason"),
        "message": provider.get("message"),
        "warnings": [provider["message"]] if isinstance(provider.get("message"), str) else [],
    }


def _artifact_layout(layout_result: dict[str, Any]) -> dict[str, Any] | None:
    layout = layout_result.get("layout")
    if not isinstance(layout, dict):
        return None
    positions = layout.get("positions")
    if not isinstance(positions, list):
        return None
    return {
        "layout_id": "reaction-layout::tmap",
        "provider": "tmap_layout",
        "status": "OK",
        "coordinate_system": "tmap_2d",
        "nodes": [
            {
                "reaction_entity_id": position["reactionId"],
                "x": position["x"],
                "y": position["y"],
                "warnings": [],
            }
            for position in positions
            if isinstance(position, dict)
        ],
        "warnings": layout_result.get("warnings", []),
        "diagnostics": layout.get("diagnostics"),
    }


if __name__ == "__main__":
    sys.exit(main())
