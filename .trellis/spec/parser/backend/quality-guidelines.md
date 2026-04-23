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
- Public author-facing block names may use kebab-case when needed
  (`:::condition-varies`), but AST node discriminants must stay stable
  snake_case (`type: "condition_varies"`). Register the block parser in
  `packages/parser/src/body/block-parsers/index.ts` and add public parser
  tests for the exact fence syntax.

## Tests

- Add regression tests in `packages/parser/tests` for every behavior change.
- Assert stable diagnostic codes, not only message text.
- Cover good, base, and bad cases for parsers, validators, renderers, and exporters.

## Examples

- `packages/parser/src/index.ts`
- `packages/parser/src/frontmatter/parse-frontmatter.ts`
- `packages/parser/tests/parser.test.ts`

## Anti-Patterns

- Do not change AST fields in a renderer-only package.
- Do not add behavior without a test fixture that exercises the public API.
- Do not paper over complexity lint by moving unrelated logic into a generic helper.
