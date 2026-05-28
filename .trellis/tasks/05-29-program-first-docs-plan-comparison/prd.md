# Docs Comparison Against Program Rewrite Plan

Source plan: `D:\download\chemd-program-rewrite-implementation-plan.md`.

## Objective

Compare the program-first rewrite plan against `apps/docs` and close remaining
documentation drift after Phase 7 cleanup.

## Scope

- Keep root `docs/` untouched.
- Update only `apps/docs` program-v1 and diagnostic reference pages.
- Remove stale Phase 0 transition language.
- Replace generic `legacy fenced block` placeholders with explicit removed
  syntax names where docs explain diagnostics or migration boundaries.
- Ensure EN/ZH pages both document `agent run` syntax.

## Acceptance

- `apps/docs` documents program syntax, Markdown-as-comment, agent run syntax,
  and export/RAG truth boundaries.
- Removed legacy syntax is explained as a diagnostic/migration boundary, not as
  supported language documentation.
- No root `docs/` changes.
