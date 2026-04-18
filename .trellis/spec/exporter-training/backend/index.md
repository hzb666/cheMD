# Backend Development Guidelines - @chemd/exporter-training

Status: Filled from the current codebase.

## Scope

`@chemd/exporter-training` exports resolved Chemd documents into training data layers for retrieval and prediction workflows. Treat this package as a strict TypeScript library unless a file name explicitly marks a Node-only adapter, such as `packages/compiler/src/node.ts`.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Directory Structure](./directory-structure.md) | Filled | Package layout, public entry points, and ownership |
| [Database Guidelines](./database-guidelines.md) | Filled | Persistence and external IO boundaries |
| [Error Handling](./error-handling.md) | Filled | Diagnostics, thrown errors, and fallback behavior |
| [Quality Guidelines](./quality-guidelines.md) | Filled | TypeScript, testing, lint, and package contracts |
| [Logging Guidelines](./logging-guidelines.md) | Filled | Logging policy for library code |

## Pre-Development Checklist

- Read `AGENTS.md` and this package's relevant guideline file before editing.
- Inspect the public API at `packages/exporter-training/src/index.ts` before adding exports.
- Search for existing AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- Add or update tests under `packages/exporter-training/tests` for behavior changes.
- Run `pnpm --filter @chemd/exporter-training test` and `pnpm --filter @chemd/exporter-training typecheck` for package changes.

## Examples To Follow

- `packages/exporter-training/src/export-record.ts`
- `packages/exporter-training/src/types.ts`
- `packages/exporter-training/tests/exporter-record.test.ts`

## Architectural Contract

Source documents flow through `@chemd/parser`, `@chemd/resolver`, `@chemd/render-profile`, renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate parsing, rendering, or validation logic in downstream packages.
