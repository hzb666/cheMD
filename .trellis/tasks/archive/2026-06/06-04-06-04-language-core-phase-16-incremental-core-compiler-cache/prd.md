# Phase 16: Incremental core compiler cache

## Goal

Add a pure in-memory incremental compiler entry for language-core compilation so
callers can reuse `compileChemdCore` results when the source and options have
not changed.

## Scope

- Add a compiler-level incremental cache API.
- Key cache entries by source content and core compile options.
- Return cache status, revision, and source/options hashes with the core result.
- Keep existing `compileChemdCore` and `compileChemd` behavior unchanged.

## Non-goals

- No IDE integration.
- No file watching or workspace indexing.
- No training/RAG output caching.
- No docs/spec reads or edits.

## Validation

- compiler targeted tests
- compiler typecheck
- Trellis context validation
- git diff --check
