# Backend Development Guidelines - @chemd/compiler

Status: Filled from the current codebase.

## Scope

`@chemd/compiler` orchestrates the program-first pipeline: parse program-v1
source, resolve program references, typecheck, resolve render profile, build run
plan and runtime preflight, build LNF/training/RAG/authoring/diagnosis outputs,
and render HTML, JSON, and DOCX bridge outputs. Treat this package as a strict
TypeScript library unless a file name explicitly marks a Node-only adapter, such
as `packages/compiler/src/node.ts`.

## Guideline Index

| Guide | Status | Purpose |
|-------|--------|---------|
| [Directory Structure](./directory-structure.md) | Filled | Package layout, public entry points, and ownership |
| [Database Guidelines](./database-guidelines.md) | Filled | Persistence and external IO boundaries |
| [Error Handling](./error-handling.md) | Filled | Diagnostics, thrown errors, and fallback behavior |
| [Quality Guidelines](./quality-guidelines.md) | Filled | TypeScript, testing, lint, and package contracts |
| [Logging Guidelines](./logging-guidelines.md) | Filled | Logging policy for library code |
| [Program v1 Contracts](./language-v03-contracts.md) | Filled | Program AST, semantic graph, step graph, runtime, LNF, and training export contracts |

## Pre-Development Checklist

- Read `AGENTS.md` and this package's relevant guideline file before editing.
- Inspect the public API at `packages/compiler/src/index.ts` before adding exports.
- Search for existing program AST fields, diagnostic codes, render paths, or schema names before adding new ones.
- For program-v1 semantic outputs, read [Program v1 Contracts](./language-v03-contracts.md) before changing pipeline order or payload fields.
- Add or update tests under `packages/compiler/tests` for behavior changes.
- Run `pnpm --filter @chemd/compiler test` and `pnpm --filter @chemd/compiler typecheck` for package changes.

## Examples To Follow

- `packages/compiler/src/index.ts`
- `packages/compiler/src/node.ts`
- `packages/compiler/tests/compiler.test.ts`

## Architectural Contract

Program documents flow through `@chemd/parser`, `@chemd/resolver`,
`@chemd/typechecker`, `@chemd/render-profile`, runtime/export packages,
renderers, and `@chemd/compiler`. Do not bypass this chain with duplicate
parsing, rendering, or validation logic in downstream packages.
