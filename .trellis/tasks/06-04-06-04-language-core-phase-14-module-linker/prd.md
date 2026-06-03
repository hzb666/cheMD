# Phase 14: Module linker

## Goal

Add a language-core linker for Chemd program modules so imports can be checked
across a module set without involving docs, training exports, RAG, or IDE code.

## Scope

- Compile multiple Chemd module inputs through the pure core compiler entry.
- Build an import graph from program `import` declarations.
- Diagnose missing modules, cyclic imports, and missing imported symbols.
- Return linked module metadata and diagnostics without changing single-file
  compile behavior.

## Non-goals

- No training/RAG/exporter-training changes.
- No IDE/language-service integration.
- No docs/spec reads or edits.
- No file-system resolver; callers provide module sources explicitly.

## Validation

- compiler targeted tests
- compiler typecheck
- Trellis context validation
- git diff --check
