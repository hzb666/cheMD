# Backend Development Guidelines - @chemd/render-profile

Status: Filled from the current codebase.

## Scope

`@chemd/render-profile` resolves render profiles, validates overrides, enforces numeric constraints, and maps render options to adapter payloads. Treat this package as a strict TypeScript library unless a file name explicitly marks a Node-only adapter, such as `packages/compiler/src/node.ts`.

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
- Inspect the public API at `packages/render-profile/src/index.ts` before adding exports.
- Search for existing AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- Add or update tests under `packages/render-profile/tests` for behavior changes.
- Run `pnpm --filter @chemd/render-profile test` and `pnpm --filter @chemd/render-profile typecheck` for package changes.

## Examples To Follow

- `packages/render-profile/src/index.ts`
- `packages/render-profile/tests/render-profile.test.ts`
- `packages/compiler/src/index.ts`

## Architectural Contract

Source documents flow through `@chemd/parser`, `@chemd/resolver`, `@chemd/render-profile`, renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate parsing, rendering, or validation logic in downstream packages.
