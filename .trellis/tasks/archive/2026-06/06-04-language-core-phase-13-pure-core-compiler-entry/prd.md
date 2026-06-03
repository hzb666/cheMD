# Phase 13: Pure core compiler entry

## Goal

Add a pure language-core compiler entry that excludes training/RAG outputs while
keeping the existing `compileChemd` API compatible.

## Scope

- Introduce a core compile result type.
- Move parse/resolve/typecheck/render/runtime/LNF setup behind the core entry.
- Keep training/RAG construction only in `compileChemd`.
- Do not read or depend on docs/spec files.

## Validation

- compiler targeted tests
- compiler typecheck
- compiler fixture matrix
- Trellis context validation
- git diff --check
