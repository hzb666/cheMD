# Phase 20: Program type index

## Goal

Expose a queryable type index for Chemd program fields so tools can inspect
expected schema types, actual AST value kinds, aliases, and related diagnostics
without reimplementing typechecker logic.

## Scope

- Add a typechecker function that builds a program field type index.
- Include declaration id/kind, source field, canonical field, expected kind,
  actual kind, alias status, required status, validity, and diagnostic codes.
- Preserve existing typecheck diagnostics and graph behavior.

## Non-goals

- No new type rules.
- No docs/spec reads or edits.
- No training/RAG/IDE changes.
- No compiler result shape changes.

## Validation

- typechecker targeted tests
- typechecker typecheck
- Trellis context validation
- git diff --check
