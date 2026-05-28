# Phase 2: Parser Replacement

## Goal

Replace `@chemd/parser`'s public parse path with a program-first parser that
returns `ChemdProgramDocument` and emits fatal diagnostics for removed legacy
Markdown/frontmatter/fenced-block syntax.

## Scope

- Add `packages/parser/src/program/*` for lexer, tokens, parser, values,
  declaration parsing, procedure parsing, agent parsing, doc comments, errors,
  and public program entrypoint.
- Update `packages/parser/src/index.ts` so `parseChemd` delegates to
  `parseChemdProgram`.
- Keep old body/frontmatter files in the repo during this phase only if needed
  for downstream compile stability, but they must no longer be the public
  parser implementation.
- Add program parser tests:
  - basic module/import/meta/declaration parse
  - value parsing for string, identifier, boolean, number, quantity, percent,
    reference, list, record, call
  - doc comments from `///` and `/*md */`
  - procedure step parsing
  - agent run nested entries
  - fatal legacy syntax diagnostics for frontmatter and `:::` blocks

## Boundaries

- Do not modify root `docs/`.
- Do not update downstream resolver/typechecker/compiler packages in this
  phase beyond type fallout that is unavoidable for `@chemd/parser` tests.
- Do not implement a legacy AST adapter or legacy lowering path.
- Parser classifies values and preserves raw source; type validation and
  normalization remain later phases.

## Verification

- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/parser typecheck`
- `pnpm --filter @chemd/core typecheck`
- `git diff --check`
