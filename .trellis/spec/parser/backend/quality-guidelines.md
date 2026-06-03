# Quality Guidelines - @chemd/parser

## Required Checks

- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/parser typecheck`
- For broad changes, also run `pnpm test` and `pnpm typecheck` at the repo root.

## Code Standards

- TypeScript strict mode is enabled through `tsconfig.base.json`.
- Use 2-space indentation, semicolons, and double quotes.
- Keep public API boundaries typed with exported interfaces or discriminated unions.
- Keep functions focused; root ESLint enforces complexity, max params, nesting, statements, and function length.
- Prefer pure transforms from input data to output data.
- Public author-facing declaration and field names may use kebab-case when the
  language grammar requires it, but AST discriminants must stay stable
  snake_case. Register new program-v1 grammar behavior in the program parser
  modules and add public parser tests for the exact source syntax.
- `condition_screen` declarations support concise optimization attempts.
  Preserve attempt references as addressable program facts rather than
  flattening them into the parent declaration.

## Tests

- Add regression tests in `packages/parser/tests` for every behavior change.
- Assert stable diagnostic codes, not only message text.
- Cover good, base, and bad cases for parsers, validators, renderers, and exporters.

## Examples

- `packages/parser/src/index.ts`
- `packages/parser/src/program/parser.ts`
- `packages/parser/tests/program-parser.test.ts`

## Anti-Patterns

- Do not change AST fields in a renderer-only package.
- Do not add behavior without a test fixture that exercises the public API.
- Do not paper over complexity lint by moving unrelated logic into a generic helper.
