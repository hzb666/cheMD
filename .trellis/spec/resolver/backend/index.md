# Backend Development Guidelines - @chemd/resolver

Status: Filled from the current codebase.

## Scope

`@chemd/resolver` resolves references, expands templates, assigns fallback object ids, and validates semantic document invariants. Treat this package as a strict TypeScript library unless a file name explicitly marks a Node-only adapter, such as `packages/compiler/src/node.ts`.

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
- Inspect the public API at `packages/resolver/src/index.ts` before adding exports.
- Search for existing AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- Add or update tests under `packages/resolver/tests` for behavior changes.
- Run `pnpm --filter @chemd/resolver test` and `pnpm --filter @chemd/resolver typecheck` for package changes.

## Examples To Follow

- `packages/resolver/src/index.ts`
- `packages/resolver/tests/resolver.test.ts`
- `packages/compiler/src/index.ts`

## Architectural Contract

Source documents flow through `@chemd/parser`, `@chemd/resolver`, `@chemd/render-profile`, renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate parsing, rendering, or validation logic in downstream packages.
