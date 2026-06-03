# Backend Development Guidelines - @chemd/parser

Status: Filled from the current codebase.

## Scope

`@chemd/parser` parses Chemd `program-v1` source into
`ChemdProgramDocument` (`chemd-program-ast/v1`) and parser diagnostics. Treat
this package as a strict TypeScript library unless a file name explicitly marks
a Node-only adapter, such as `packages/compiler/src/node.ts`. Legacy Markdown
or fence syntax may be detected for migration diagnostics, but it is not the
primary parser contract.

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
- Inspect the public API at `packages/parser/src/index.ts` before adding exports.
- Search for existing program AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- Add or update tests under `packages/parser/tests` for behavior changes.
- Run `pnpm --filter @chemd/parser test` and `pnpm --filter @chemd/parser typecheck` for package changes.

## Examples To Follow

- `packages/parser/src/index.ts`
- `packages/parser/src/program/parser.ts`
- `packages/parser/tests/program-parser.test.ts`

## Architectural Contract

Program documents flow through `@chemd/parser`, `@chemd/resolver`,
`@chemd/typechecker`, `@chemd/render-profile`, runtime/export packages,
renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate
parsing, rendering, or validation logic in downstream packages.
