# Quality Guidelines - @chemd/compiler

## Required Checks

- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/compiler typecheck`
- For broad changes, also run `pnpm test` and `pnpm typecheck` at the repo root.

## Code Standards

- TypeScript strict mode is enabled through `tsconfig.base.json`.
- Use 2-space indentation, semicolons, and double quotes.
- Keep public API boundaries typed with exported interfaces or discriminated unions.
- Keep functions focused; root ESLint enforces complexity, max params, nesting, statements, and function length.
- Prefer pure transforms from input data to output data.

## Tests

- Add regression tests in `packages/compiler/tests` for every behavior change.
- Assert stable diagnostic codes, not only message text.
- Cover good, base, and bad cases for parsers, validators, renderers, and exporters.

## Examples

- `packages/compiler/src/index.ts`
- `packages/compiler/src/node.ts`
- `packages/compiler/tests/compiler.test.ts`

## Anti-Patterns

- Do not change AST fields in a renderer-only package.
- Do not add behavior without a test fixture that exercises the public API.
- Do not paper over complexity lint by moving unrelated logic into a generic helper.
