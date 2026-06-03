# Phase 10: Typechecker upstream diagnostic spans

## Goal

Preserve upstream diagnostic source spans when parser/resolver diagnostics pass
through the typechecker.

## Scope

- Keep existing source layer/node/field/facts behavior.
- Add source span preservation to the typechecker conversion path.
- Do not read or depend on docs/spec files.

## Validation

- typechecker targeted tests
- typechecker typecheck
- compiler fixture matrix
- Trellis context validation
- git diff --check
