from __future__ import annotations

import argparse
import json
from pathlib import Path

from .layout import ClusterWorkerError, read_json, run_layout_worker, write_json


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Chemd reaction cluster layout worker")
    parser.add_argument("--input", required=True, help="Input graph/layout JSON path")
    parser.add_argument("--output", help="Output JSON path. Defaults to stdout")
    parser.add_argument("--engine", choices=["auto", "fallback", "tmap"], default="auto")
    parser.add_argument("--missing-tmap", choices=["skip", "error", "fallback"], default="skip")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = read_json(Path(args.input))
        result = run_layout_worker(payload, engine=args.engine, missing_tmap=args.missing_tmap)
    except ClusterWorkerError as error:
        result_payload = {
            "status": "ERROR",
            "code": "invalid_input",
            "message": str(error),
            "artifact": None,
        }
        if args.output:
            write_json(Path(args.output), result_payload, args.pretty)
        else:
            print(json.dumps(result_payload, indent=2 if args.pretty else None, sort_keys=True))
        return 2

    if args.output:
        write_json(Path(args.output), result.payload, args.pretty)
    else:
        print(json.dumps(result.payload, indent=2 if args.pretty else None, sort_keys=True))
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
