# Language-service Monaco Completion DTO

## Goal

Implement Monaco-consumable Chemd completion capabilities in
`@chemd/language-service` without importing `monaco-editor` or wiring the
desktop app.

## Scope

- Add explicit completion and workspace-symbol DTO types.
- Add pure completion functions for snippets, field names, conservative values,
  and references from supplied symbols.
- Keep completion logic modular and testable.
- Cover snippet, field/value, reference, range/insert text, empty document, and
  invalid-context fallback behavior with tests.

## Non-goals

- No `apps/desktop` integration.
- No workspace file scanning.
- No new dependencies.
- No root config, package manifest, lockfile, docs, or unrelated package edits.

## Verification

- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/language-service typecheck`
