# Directory Structure - @chemd/resolver

## Overview

`packages/resolver` is a workspace package with a narrow public API. Keep package code in `src`, tests in `tests`, and public exports in `src/index.ts`.

## Directory Layout

```text
packages/resolver/
|-- package.json
|-- tsconfig.json
|-- src/
|   +-- index.ts
+-- tests/
    +-- *.test.ts
```

Some packages split implementation files below `src`, for example
`packages/parser/src/program/*` and `packages/renderer-html/src/*`. Follow the
local split when adding related behavior.

## Module Organization

- Public API: export from `src/index.ts`; consumers should import `@chemd/*`, not deep relative paths.
- Internal helpers: keep beside the feature they serve, such as resolver
  reference helpers under `src/program-references.ts`.
- Cross-package contracts: define shared AST and diagnostic shapes in `@chemd/core` first.
- Node-only adapters: isolate them behind explicit exports, as in `@chemd/compiler/node`.

## Naming Conventions

- Use kebab-case package folders and file names that describe behavior, such as
  `program-references.ts`.
- Use `camelCase` functions and `PascalCase` exported interfaces/types.
- Use diagnostic codes with stable `E_` or `W_` prefixes.

## Examples

- `packages/resolver/src/index.ts`
- `packages/resolver/tests/resolver.test.ts`
- `packages/compiler/src/index.ts`

## Anti-Patterns

- Do not add package-level runtime side effects on import.
- Do not duplicate an AST interface locally when it belongs in `@chemd/core`.
- Do not import from another package's private `src/*` path unless the package has no public contract yet and the test already follows that pattern.
