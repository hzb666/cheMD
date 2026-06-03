# Phase 1: Program Contract Hardening

## Goal

Make `@chemd/core` expose a clear program-first contract while preserving older
AST and block-schema compatibility through an explicit compat entrypoint. This
phase should not change compiler behavior; it should make imports and tests show
which surface is program-first and which surface is compatibility-only.

## Scope

- Add explicit `@chemd/core/program` and `@chemd/core/compat` subpath surfaces if
  needed by package exports and TypeScript resolution.
- Keep root `@chemd/core` focused on program-first AST, diagnostics,
  declarations, quantities, reference utilities, render overrides, and other
  shared primitives still required by the current pipeline.
- Move older AST, AST factories, and block-schema consumers to the compat
  surface where practical.
## Non-Goals

- Do not delete compatibility source files in this phase.
- Do not rewrite parser, resolver, typechecker, compiler behavior.
- Do not change serialized output schemas.
- Do not change IDE UI or desktop code.
- Do not read or update docs/spec documents in this phase.

## Acceptance Criteria

- `@chemd/core` root no longer directly exports compatibility `ast`, `ast-factories`,
  or `schema/block-schema` as primary public API.
- Compatibility consumers can import old AST/block-schema contracts from an
  explicit compat surface.
- Program-first consumers can import `ChemdProgramDocument` and related program
  contracts from root and/or a program surface.
- Core tests prove the program and compat surfaces stay intentionally separated.
- Compiler-facing packages continue to typecheck against program-first document
  contracts.

## Verification

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- `pnpm --filter @chemd/parser typecheck`
- `pnpm --filter @chemd/resolver typecheck`
- `pnpm --filter @chemd/typechecker typecheck`
- `pnpm --filter @chemd/compiler typecheck`
- `git diff --check`
