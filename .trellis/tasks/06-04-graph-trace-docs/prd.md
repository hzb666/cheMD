# PRD: Graph Trace Documentation

## Goal

Update user-facing documentation so `chemd graph` reflects the current
workspace reaction graph and optional runtime trace overlay.

## Scope

- Document `chemd graph <file...> --trace trace.json --format json`.
- Describe workspace-level reaction graph nodes and edges.
- Describe runtime trace event and state snapshot graph edges.
- Keep English and Chinese docs aligned.
- Keep README examples aligned with the CLI table and common workflows.

## Acceptance

- README lists the current graph command shape.
- Export docs describe graph output as a workspace-aware superset.
- CLI workflow docs mention `--trace` and the trace JSON shape.
- Docs coverage and marked examples tests pass.
