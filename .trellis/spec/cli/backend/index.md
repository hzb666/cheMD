# Backend Development Guidelines - @chemd/cli

Status: Filled from the current codebase.

## Scope

`@chemd/cli` exposes the `compileChemd()` pipeline to local Git, CI, and LLM
tooling. Keep parsing, resolving, validation, and export semantics delegated to
`@chemd/compiler`; the CLI owns argument parsing, exit codes, stdout/stderr
contracts, Git working-tree discovery, and semantic diff formatting.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Command Contract](./command-contract.md) | Filled | Commands, exit codes, JSON schemas, and Git behavior |
| [Quality Guidelines](./quality-guidelines.md) | Filled | Testing, package integration, and validation commands |

## Pre-Development Checklist

- Read `AGENTS.md` and this package's relevant guideline file before editing.
- Preserve `compileChemd(source)` under the current language contract as the
  semantic source of truth.
- Keep machine-readable output deterministic and JSON-parseable.
- Do not write business payloads to stdout when returning a validation failure.
- Add or update tests in `packages/cli/src/*.spec.ts` for every CLI behavior
  change.
- Run `pnpm --filter @chemd/cli test`, `pnpm --filter @chemd/cli typecheck`,
  and the root validation suite for broad changes.

## Examples To Follow

- `packages/cli/src/cli.ts`
- `packages/cli/src/git-changed.ts`
- `packages/cli/src/semantic-diff.ts`
- `packages/cli/src/cli.spec.ts`
