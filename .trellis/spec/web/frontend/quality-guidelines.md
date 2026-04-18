# Quality Guidelines - @chemd/web

## Required Checks

Use the narrowest useful command first, then broaden when the change crosses boundaries.

- `pnpm --filter @chemd/web test -- <test-file>` for targeted route, hook, and helper tests.
- `pnpm --filter @chemd/web test` for broad web behavior changes.
- `pnpm --filter @chemd/web typecheck` for any TypeScript change in `apps/web`.
- `pnpm exec eslint apps/web/src/app/api apps/web/src/server --ext .ts,.tsx` for route/server refactors.
- `pnpm build` only when changes affect build integration or Next configuration.

## Code Standards

- Keep route handlers thin: parse, call server helper, serialize response.
- Reuse `request-parsers.ts`, `route-responses.ts`, and DTO types instead of hand-rolling request validation.
- Keep browser-only code out of server helpers and server-only code out of client components.
- Respect root ESLint complexity, max params, max depth, max statements, and function length rules.

## Tests

- Add route tests under `apps/web/tests` for each API behavior change.
- Add feature helper tests for pure lib utilities.
- When renderer HTML contracts change, update preview hydration tests.
- Assert response status, response body shape, warnings, and fallback behavior.

## Examples

- `apps/web/tests/chem-render-route.test.ts` for route contracts.
- `apps/web/tests/json-export.test.ts` for export behavior and fallback semantics.
- `apps/web/tests/rendered-preview-helpers.test.ts` for preview hydration helpers.

## Anti-Patterns

- Do not weaken route validation to make tests pass.
- Do not duplicate response envelope construction in individual routes.
- Do not fix complexity lint by hiding mixed responsibilities in a generic bag-of-options helper.
