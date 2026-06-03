# Phase 19: Program language contract

## Goal

Expose a machine-readable Chemd program language contract that tools can use
without scraping parser source or docs.

## Scope

- Expand the core language contract with program tokens, keywords, declarations,
  meta primary fields, import syntax, reference forms, value forms, and parser
  capabilities.
- Re-export the same contract from the parser package.
- Preserve existing parser behavior.

## Non-goals

- No docs/spec reads or edits.
- No IDE integration.
- No training/RAG exports.
- No syntax changes.

## Validation

- core contract tests
- parser typecheck
- core typecheck
- Trellis context validation
- git diff --check
