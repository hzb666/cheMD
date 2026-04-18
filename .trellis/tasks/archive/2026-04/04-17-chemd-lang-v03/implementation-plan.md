# chemd-lang v0.3 Implementation Plan

> **For agentic workers:** Execute sequentially in the current workspace. Steps use checkbox syntax for tracking.

**Goal:** Add a surface-preserving chemd-lang v0.3 internal semantic language layer.

**Architecture:** Keep parser/resolver/renderers unchanged as the author-surface chain. Add post-resolver packages for diagnostics, step ontology, typed semantic graph, runtime planning/trace, and LNF, then integrate these artifacts into `compileChemd` and training export.

**Tech Stack:** TypeScript workspace packages, Vitest, strict `tsc`, existing `@chemd/*` public APIs.

---

## Chunk 1: Contract Tests

- [ ] Add compiler-level test that compiles a v0.1 Markdown document and expects v0.3 artifacts.
- [ ] Add package-level tests for step lowering, typechecking, runtime planning, trace replay, and LNF.
- [ ] Run the tests and verify they fail because the v0.3 API is missing.

## Chunk 2: Core Packages

- [ ] Add `@chemd/diagnostics` registry, factory, legacy mapping, and quick-fix helpers.
- [ ] Add `@chemd/step-ontology` with procedure, observation, and analysis lowering.
- [ ] Add `@chemd/typechecker` with quantity/status normalization, typed nodes, step graph, and diagnostics.

## Chunk 3: Runtime and LNF

- [ ] Add `@chemd/runtime-lab` planner, preflight, run state, step state transitions, and trace creation.
- [ ] Add `@chemd/runtime-trace` replay/export helpers.
- [ ] Add `@chemd/lnf` canonical internal representation builder.

## Chunk 4: Integration

- [ ] Update workspace TypeScript paths and package dependencies.
- [ ] Extend `@chemd/compiler` result with typed graph, step graph, run plan, preflight result, LNF, and training export.
- [ ] Extend `@chemd/exporter-training` types and builder to include v0.3 LNF and procedure/observation task pairs.

## Chunk 5: Verification

- [ ] Run targeted package tests and typechecks.
- [ ] Run root test/typecheck if targeted checks pass.
- [ ] Review git diff for scope and unrelated changes.
- [ ] Commit only this task's files if repository and user instructions allow it.
