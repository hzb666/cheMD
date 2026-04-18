# Frontend Quality Guidelines - @chemd/core

## Required Checks

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- If `apps/web` consumes the changed contract, run `pnpm --filter @chemd/web test` for affected tests.

## Browser Consumption Rules

- Keep package exports ESM-compatible.
- Avoid Node APIs in default exports that the Next app imports.
- Keep rendered HTML deterministic so React-side hydration helpers can test string contracts.
- When changing renderer output, update both package tests and web preview tests when applicable.

## Examples

- `apps/web/src/features/chem-preview/hooks/useRenderedPreview.ts` depends on renderer HTML placeholders.
- `apps/web/tests/rendered-preview-helpers.test.ts` and related preview tests protect hydration behavior.
- `packages/compiler/tests/compiler.test.ts` protects the end-to-end browser-facing compile output.
