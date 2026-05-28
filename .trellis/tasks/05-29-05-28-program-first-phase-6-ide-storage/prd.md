# Phase 6: Storage, Language Service, and Desktop IDE

Source plan: `D:\download\chemd-program-rewrite-implementation-plan.md`.

## Objective

Move the remaining editor, workspace, Graph/RAG, storage, and playground
surfaces from legacy block/fence assumptions to program declarations,
documentation comments, source ranges, and training export v0.3.

## Scope

- `packages/language-service/src/*`
- `packages/language-service/tests/*`
- `apps/desktop/src/features/editor/*`
- `apps/desktop/src/features/preview/*`
- `apps/desktop/src/knowledge-map/*`
- `apps/desktop/src/workspace-index/*`
- `apps/desktop/src/features/reaction-intelligence/*`
- `packages/storage-postgres/src/*`
- `apps/web/src/*`
- `apps/docs/content/docs/*` only if user-facing docs must change

Do not modify root `docs/`.

## Acceptance

- Desktop opens `.chemd` program files.
- Outline shows module, declarations, procedure steps, traces, and agent runs.
- Diagnostics map to program source ranges.
- Completion, hover, definition, semantic tokens, and selection/navigation use
  program declarations and reference expressions.
- Graph/RAG views resolve declaration and documentation citations.
- Storage/web code accepts training export v0.3 and program declaration/doc
  records.
- Old `:::` fixtures are deleted or rewritten in the touched test suites.

## Known Inputs

- Phase 5 completed in `b165692`.
- `pnpm --filter @chemd/desktop typecheck` passes.
- `pnpm --filter @chemd/language-service test` and
  `pnpm --filter @chemd/desktop test` fail on legacy fixtures and old
  language-service behavior; these are Phase 6 work items.
