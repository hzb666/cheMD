# Phase 11: Workspace index AST references

## Goal

Use compiled AST reference evidence for workspace index references so strings
and unrelated text do not create false workspace diagnostics.

## Scope

- Use language-service program references when compile succeeds.
- Keep text scanning as compile-failure fallback.
- Do not read or depend on docs/spec files.

## Validation

- workspace-index targeted tests
- workspace-index typecheck
- language-service typecheck
- compiler fixture matrix
- Trellis context validation
- git diff --check
