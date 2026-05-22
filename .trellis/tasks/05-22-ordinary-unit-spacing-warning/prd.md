# Ordinary Unit Spacing Warning

## Goal

Treat compact ordinary unit spacing issues as warnings, not errors. A value
such as `1ml` is still non-canonical authoring style, but it is unambiguous and
can be normalized, so validation should keep the typed quantity and emit a
warning.

## Boundaries

- Keep truly unparseable quantities as `E403` errors.
- Keep spaced percent-sign literals such as `78 %` as errors because `%` is a
  compact percent literal suffix, not an ordinary unit.
- Preserve canonical quantity output for compact ordinary units when the unit
  is recognized.
- Update docs and tests so they describe compact ordinary unit spacing as a
  warning and percent spacing as an error.

## Checks

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/typechecker typecheck`
- `pnpm --filter @chemd/diagnostics test`
- `pnpm --filter @chemd/compiler test -- docs-marked-examples.test.ts`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`
- `pnpm --filter @chemd/docs typecheck`
- `git diff --check`
