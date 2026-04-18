# Backend Development Guidelines - @chemd/renderer-json

Status: Filled from the current codebase.

## Scope

`@chemd/renderer-json` serializes resolved Chemd documents into inspectable JSON while preserving semantic fields and omitting render style metadata. Treat this package as a strict TypeScript library unless a file name explicitly marks a Node-only adapter, such as `packages/compiler/src/node.ts`.

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
- Inspect the public API at `packages/renderer-json/src/index.ts` before adding exports.
- Search for existing AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- Add or update tests under `packages/renderer-json/tests` for behavior changes.
- Run `pnpm --filter @chemd/renderer-json test` and `pnpm --filter @chemd/renderer-json typecheck` for package changes.

## Examples To Follow

- `packages/renderer-json/src/index.ts`
- `packages/renderer-json/tests/renderer-json.test.ts`
- `packages/compiler/tests/compiler.test.ts`

## Architectural Contract

Source documents flow through `@chemd/parser`, `@chemd/resolver`, `@chemd/render-profile`, renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate parsing, rendering, or validation logic in downstream packages.
