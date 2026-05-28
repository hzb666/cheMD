# Phase 3: Resolver and Typechecker Replacement

## Goal

Replace resolver/typechecker traversal of legacy `ChemdDocument.children` with
program-first declaration traversal over `ChemdProgramDocument`.

## Scope

- `packages/resolver/src/*`
  - Build program symbol tables from module, imports, meta, declarations, and
    docs.
  - Resolve local, field, module, and external document references.
  - Resolve doc-comment references as documentation references only.
  - Remove template/use expansion from the public resolver path.
- `packages/typechecker/src/*`
  - Rename/add `typecheckProgram` and make `typecheckDocument` point at program
    validation only if retained for temporary public API stability.
  - Validate declaration required fields and value shapes through declaration
    schema.
  - Build typed semantic graph from declarations.
  - Validate procedure and agent declarations.
- `packages/step-ontology/src/*` only if procedure lowering depends on legacy
  node/source metadata.
- Focused program tests in resolver and typechecker.

## Boundaries

- Do not modify root `docs/`.
- Do not reintroduce legacy parser fallback, template/use expansion, or
  Markdown-node semantic facts.
- Keep changes scoped to resolver/typechecker/step-ontology unless compiler
  type fallout requires a narrow compatibility export.

## Verification

- `pnpm --filter @chemd/resolver test`
- `pnpm --filter @chemd/resolver typecheck`
- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/typechecker typecheck`
- `pnpm --filter @chemd/parser test`
- `git diff --check`
