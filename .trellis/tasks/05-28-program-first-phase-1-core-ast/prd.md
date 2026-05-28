# Phase 1: Core AST Replacement

## Goal

Introduce the program-first core contracts needed by later parser, resolver,
typechecker, compiler, renderer, export, storage, and Desktop IDE phases.

## Scope

- Add `ChemdProgramDocument`.
- Add module, import, meta, declaration, value, doc-comment, procedure, and
  agent-run AST contracts.
- Add declaration schema helpers beside the legacy block schema.
- Export the new contracts from `@chemd/core`.
- Add core tests for program document shape, reference shape, doc attachments,
  and declaration schema lookup.

## Compatibility Strategy

This phase is additive. Legacy `ChemdDocument`, `ChemdNode`, `StructuredNode`,
`MarkdownNode`, `TemplateNode`, `UseNode`, `ColNode`, and `block-schema` stay
available so the repository remains typecheckable while downstream packages are
migrated in later phases.

The final removal happens after parser, resolver, typechecker, compiler,
renderers, exports, storage, language service, and Desktop IDE no longer depend
on the legacy contracts.

## Verification

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- `git diff --check`
