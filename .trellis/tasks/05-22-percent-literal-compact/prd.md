# Percent Literal Compact Syntax

## Goal

Treat `%` as part of a percent literal instead of an ordinary unit separator.
Chemd should accept `78%`, `<5%`, `96±2%`, and `91-95%` for percent fields
without emitting the generic compact-unit `E403`. Spaced percent-sign forms
such as `78 %` should be diagnosed because `%` is not an ordinary unit token.

## Boundaries

- Do not relax ordinary unit spacing. `1.0mmol`, `30min`, and `1ml` remain
  compact-unit errors unless an existing special-case already accepts them.
- Preserve normalized `QuantityType` output for percent values.
- Keep out-of-range percent validation as `E402`.
- Update tests and docs so examples do not drift from the language rule.

## Checks

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/typechecker typecheck`
- `pnpm --filter @chemd/diagnostics test`
- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`
- `pnpm --filter @chemd/compiler test -- docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs typecheck`
- `git diff --check`
