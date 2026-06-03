# Phase 12: Compiler diagnostic dedupe

## Goal

Avoid duplicating upstream diagnostics when the compiler merges resolver and
typechecker diagnostics.

## Scope

- Preserve typechecker diagnostics as the canonical semantic diagnostic list.
- Keep render-profile and authoring diagnostics appended.
- Do not read or depend on docs/spec files.

## Validation

- compiler targeted tests
- compiler typecheck
- compiler fixture matrix
- Trellis context validation
- git diff --check
