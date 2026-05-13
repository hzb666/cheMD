# Workspace Symbol Index Data Layer

## Goal

Add a pure TypeScript `@chemd/workspace-index` package that builds an in-memory
workspace symbol and reference index from caller-provided Chemd documents.

## Scope

- Only write under `packages/workspace-index/**` and this Trellis task folder.
- Do not integrate the package into desktop UI, root path aliases, lockfiles, or
  existing language-service files.
- Do not read the filesystem or bind to Tauri; callers pass document content.

## Requirements

- Accept `WorkspaceDocumentInput` values with `uri`, optional `path`, `source`,
  and metadata.
- Build symbols from `@chemd/language-service` by default, with an injectable
  compile function for tests and future integration.
- Extract conservative textual references from fields such as `ref`,
  `reaction`, `product`, `prev`, `next`, `reactants`, and `products`.
- Resolve references against document-local and workspace symbols, marking
  unresolved references without failing the whole index.
- Expose query APIs for definitions, references, workspace symbol listing, and
  index summaries.
- Isolate single-document compile failures into diagnostics.

## Verification

- `pnpm --filter @chemd/workspace-index test`
- `pnpm --filter @chemd/workspace-index typecheck`
- `git diff --check`
