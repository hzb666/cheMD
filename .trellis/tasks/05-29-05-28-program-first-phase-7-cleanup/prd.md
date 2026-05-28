# Phase 7: Full Program-First Cleanup

Source plan: `D:\download\chemd-program-rewrite-implementation-plan.md`.

## Objective

Complete the program-first rewrite by removing the old Markdown body and
fenced-block compatibility surface from public contracts, tests, fixtures,
workspace indexing, CLI changed-file handling, and user-facing docs.

## Scope

- `packages/parser/src/body/*` and obsolete block parser exports.
- Legacy fixtures and tests under `packages/**/tests`, `apps/**/tests`, and
  `packages/compiler/fixtures` that still depend on `:::` syntax.
- CLI and workspace indexing behavior for `.chemd.md` compatibility.
- Web/Desktop editor helper code that inserts or rewrites legacy `:::chemd`
  blocks.
- README and `apps/docs/content/docs/*` user-facing documentation.

Do not modify root `docs/`.

## Acceptance

- No public package exports the old Markdown/structured-block AST as the
  compiler contract.
- No renderer reads `document.children`.
- No exporter emits `raw_children` or legacy `markdown_blocks`.
- No LNF migration summary references legacy block syntax.
- `.chemd.md` is not treated as a supported document extension by CLI,
  Desktop workspace indexing, or Tauri workspace IO.
- Tests no longer depend on `:::` syntax except explicit parser diagnostics
  asserting that legacy fenced blocks are rejected.
- README and `apps/docs` describe `.chemd` program files and do not document
  `template/use/col` or `.chemd.md` compatibility.
- `git diff -- docs --name-only` stays empty.

## Verification Plan

- Targeted `rg` checks for `document.children`, `raw_children`,
  `markdown_blocks`, `.chemd.md`, and `:::` dependency drift.
- Package tests and typechecks for parser, compiler, CLI, language-service,
  renderers, exporters, storage, web, desktop, and docs.
- Full available repo validation: build, typecheck, test, lint where possible.
- `git diff -- docs --name-only`.
- `git diff --check`.
