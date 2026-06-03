# Phase 15: Diagnostic-first expressions

## Goal

Make derived expression failures report stable, structured diagnostics instead
of collapsing tokenizer, parser, reference, and evaluator failures into one
opaque invalid-expression error.

## Scope

- Add structured expression error details inside the typechecker expression
  subsystem.
- Preserve the existing derived expression success behavior.
- Attach expression error code, message, and useful facts to diagnostics.
- Keep this scoped to typechecker language-core behavior.

## Non-goals

- No new expression language features.
- No parser grammar changes outside derived expression evaluation.
- No docs/spec reads or edits.
- No training/RAG/IDE changes.

## Validation

- typechecker targeted tests
- typechecker typecheck
- Trellis context validation
- git diff --check
