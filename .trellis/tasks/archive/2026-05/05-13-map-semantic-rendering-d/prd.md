# Semantic Rendering Data Contract

## Goal

Add a pure TypeScript `@chemd/semantic-rendering` package that turns compiled or
parsed Chemd data into stable semantic render DTOs for the desktop IDE preview.

## Scope

- Define versioned semantic render node, directive, tree, and shell attribute
  contracts.
- Build render trees from a `ChemdDocument` or the necessary subset of a
  compiler result.
- Preserve source ranges, diagnostics, warnings, semantic ids, node types, and
  stable ordering.
- Provide unknown-node fallback directives without throwing.
- Add focused unit tests for core semantic node kinds and contract helpers.

## Out of Scope

- React components, DOM operations, and lazy rendering implementation.
- Root workspace configuration, package path aliases, and package manager files.
- Compiler, parser, desktop app, language service, workspace index, and
  reaction map integration.

## Verification

- `pnpm --filter @chemd/semantic-rendering test`
- `pnpm --filter @chemd/semantic-rendering typecheck`
