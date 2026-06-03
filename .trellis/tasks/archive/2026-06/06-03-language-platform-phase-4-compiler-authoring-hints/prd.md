# Phase 4: Compiler authoring hints

## Goal

Strengthen compiler-facing authoring diagnostics and actionable hints for program AST workflows. Compilation should surface missing required fields, suspicious values, and quick-fix metadata consistently enough for downstream tools to consume without IDE-specific UI work.

## Scope

- Inspect compiler authoring diagnostics, authoring assistance, quick-fix, repair-loop, and related tests.
- Add focused tests for missing/suspicious program fields and actionable hint metadata.
- Implement minimal compiler changes needed to make hints deterministic and source-mapped.
- Keep IDE, docs, and spec files out of scope.

## Acceptance

- Compiler authoring tests cover new hint behavior.
- Compiler fixture matrix remains green.
- Compiler typecheck passes.
- Trellis validation and `git diff --check` pass.

## Constraints

- Do not read or change `docs/` content or spec documents.
- Preserve unrelated desktop and documentation worktree changes.
- Do not introduce IDE-specific APIs in this phase.
