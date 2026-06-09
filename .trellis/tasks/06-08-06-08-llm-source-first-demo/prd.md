# LLM Source-First Authoring Demo

## Goal

Build a focused demo showing Chemd as a program-first source language that can be authored and repaired by LLMs while keeping the compiler as the validation oracle.

## Scope

- Add a minimal natural-language to Chemd source script under `examples/llm-authoring/`.
- Add a minimal LLM generation guide at `docs/llm-chemd-guide.md`.
- Add source-first authoring and repair examples that validate as Chemd source.
- Add a Chemd source repair driver under `examples/llm-driver/`.
- Add a human-readable compiler diagnosis prompt renderer.
- Add a source-level agent audit block renderer for the demo.
- Add `repair` as a CLI alias for the existing deterministic `fix` command.
- Keep RAG, training, JSON-first generation, and complex CLI refactors out of this demo.

## Acceptance

- `pnpm chemd validate examples/llm-authoring/001-simple-suzuki/output.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/002-paper-experimental/output.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/003-missing-fields/output.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/004-failed-reaction/output.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/005-condition-screen/output.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/006-syntax-repair/repaired.chemd` succeeds.
- `pnpm chemd validate examples/llm-authoring/007-reference-repair/repaired.chemd` succeeds.
- `pnpm chemd fix <file>` and `pnpm chemd repair <file>` both run the deterministic repair flow.
- `pnpm chemd agent-loop <file> --driver node --driver-arg examples/llm-driver/chemd-source-repair-driver.mjs --format text` can use the driver protocol.
- `pnpm chemd diff examples/demo-diff/attempt-a.chemd examples/demo-diff/attempt-b.chemd --format text` demonstrates semantic source comparison.
