from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from chem_service.reaction_intelligence.providers.tmap_layout import build_tmap_layout

ARTIFACT_SCHEMA_VERSION = "chemd.reaction-intelligence-artifact.v1"


def build_artifact(job: dict[str, Any]) -> dict[str, Any]:
    layout_result = build_tmap_layout(job)
    providers = [layout_result["provider"]]
    layouts = [layout_result["layout"]] if layout_result["layout"] is not None else []

    return {
        "schemaVersion": ARTIFACT_SCHEMA_VERSION,
        "jobId": job.get("jobId"),
        "providers": providers,
        "layouts": layouts,
        "warnings": layout_result["warnings"],
        "diagnostics": {
            "reactionCount": _reaction_count(job, layout_result),
            "layoutCount": len(layouts),
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
        "schemaVersion": ARTIFACT_SCHEMA_VERSION,
        "jobId": None,
        "providers": [
            {
                "name": "tmap",
                "status": "failed",
                "reason": "invalid_job",
                "message": message,
            }
        ],
        "layouts": [],
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


if __name__ == "__main__":
    sys.exit(main())
