# Phase 3: Resolver dynamic references

## Goal

Complete resolver support for program reference expressions that cannot be treated as static field lookups only. The resolver should handle nested values, module/local/field/external-document references, preserve source spans in diagnostics, and avoid leaking resolution state across declarations.

## Scope

- Inspect resolver, core program AST, compiler integration, and tests only.
- Add focused tests for dynamic reference resolution and unresolved-reference diagnostics.
- Implement the smallest resolver changes needed to make nested and cross-document references deterministic.
- Keep IDE, docs, and spec files out of scope.

## Acceptance

- Resolver tests cover nested dynamic references and unresolved diagnostics.
- Compiler fixture matrix remains green if affected.
- Typechecks pass for touched packages.
- Trellis validation and `git diff --check` pass.

## Constraints

- Do not read or change `docs/` content or spec documents.
- Preserve unrelated desktop and documentation worktree changes.
- Keep compatibility with the Phase 1 program/compat package split.
