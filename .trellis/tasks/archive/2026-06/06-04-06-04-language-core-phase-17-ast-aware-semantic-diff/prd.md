# Phase 17: AST-aware semantic diff

## Goal

Enhance the existing semantic diff so it covers the Chemd program AST beyond
declaration objects and reports field-path-level changes for structured fields.

## Scope

- Include module, meta, import, and declaration AST nodes in semantic diff.
- Keep the existing diff schema version and CLI surface compatible.
- Report declaration/meta field changes as stable field paths.
- Continue ignoring volatile source-map/resolution/docs fields.

## Non-goals

- No IDE integration.
- No training/RAG semantic memory projections.
- No docs/spec reads or edits.
- No new CLI command options.

## Validation

- CLI semantic diff tests
- CLI typecheck
- Trellis context validation
- git diff --check
