# Phase 18: Structured runtime errors

## Goal

Give runtime preflight failures a stable, machine-readable error model while
preserving existing issue kind/message and diagnostic behavior.

## Scope

- Add stable runtime issue codes and structured facts to preflight issues.
- Generate runtime diagnostics from issue codes instead of kind-only mapping.
- Move preflight issue/result types out of the large runtime index barrel.
- Keep existing preflight severity/blocking behavior compatible.

## Non-goals

- No desktop runtime persistence changes.
- No file-system, IDE, docs, or training/RAG changes.
- No new runtime execution engine behavior.

## Validation

- runtime-lab targeted tests
- runtime-lab typecheck
- Trellis context validation
- git diff --check
