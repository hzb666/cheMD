# Chemd Language Platform Completion Plan

## Goal

Complete Chemd as a modern program-first domain language platform after the
program-first rewrite. This plan excludes IDE UI work for now. It may use
headless language-service contracts where they support diagnostics, references,
workspace symbols, or compile scheduling, but it must not depend on Desktop or
Web editor UI changes.

## Current Baseline

- Program-first AST exists as `ChemdProgramDocument` with
  `schemaVersion: "chemd-program-ast/v1"` and
  `sourceLanguage: "chemd/program-v1"`.
- `compileChemd()` already runs parse, resolve, typecheck, run-plan,
  runtime-preflight, LNF, training/RAG exports, authoring diagnostics, and
  HTML/JSON/DOCX outputs.
- Resolver supports local, field, module, and external-document reference
  expressions, but project-level dependency invalidation is still shallow.
- Typechecker builds a typed semantic graph, step graph, route augmentation,
  declaration schema diagnostics, and agent-run validation.
- Runtime packages provide run plans, preflight checks, step/control state, trace
  events, and trace replay.
- CLI exposes validate/check/preflight/export/graph/diff/changed/fix/agent-loop.
- Workspace indexing and language-service provide symbols, references, stale
  markers, hover/definition/completion data, and graph/RAG records.

## Observed Gaps

- Public core exports still include legacy `ast` and `schema/block-schema`
  surfaces, which weakens the program-first contract boundary.
- Trellis package specs for parser/resolver/compiler still contain old
  Markdown-first wording and need alignment before further implementation.
- Compiler is full-document oriented. There is debounce/stale-request handling,
  but no reusable incremental parse/resolve/typecheck engine.
- Workspace references are useful but not yet a full project graph with import
  resolution, dependency invalidation, rename/refactor safety, or changed-file
  propagation.
- Typechecking validates field shapes and routes, but the schema/type system is
  not yet deep enough for constraint validation, normalized semantic facts, or
  contract-level drift detection across exports.
- Runtime state is a step/control state machine, not yet a transaction-like
  state stack with snapshots, replay checkpoints, branching, rollback, or
  persisted audit semantics.
- Semantic diff exists at declaration/field level and memory-loop diff exists for
  training records, but they are not unified as a source patch, AST diff,
  semantic diff, runtime diff, and storage diff pipeline.
- Diagnostics and quick fixes exist but need broader source-span accuracy,
  compiler diagnosis grouping, safe-fix coverage, and CLI/headless workflows.
- Documentation and tests guard many contracts, but the next phase needs an
  explicit feature matrix so "done" is measurable.

## Non-Goals

- No Desktop IDE UI polish, Monaco wiring, window chrome, app layout, or Tauri UI
  work in this parent plan.
- No reintroduction of legacy `:::` syntax, `.chemd.md` compatibility, or
  Markdown-first compiler adapters.
- No database runtime connection ownership inside pure contract packages.
- No broad rewrite without per-phase tests and Trellis closeout.

## Trellis Execution Loop

Each phase must run as its own child task under this parent:

1. `task.py create "<phase title>" --slug <phase-slug> --package <package>`.
2. Write `prd.md` with scope, non-goals, acceptance, verification.
3. Curate `implement.jsonl` and `check.jsonl` with exact files/specs.
4. `task.py start <task-dir>`.
5. Read relevant `.trellis/spec/**/index.md` and required detail docs.
6. Implement only the current phase.
7. Run focused package tests/typechecks plus cross-layer checks for touched
   contracts.
8. Update specs/docs only when behavior or package guidance changes.
9. Commit with required message body.
10. Run `add_session.py --title ... --commit ... --summary ...`.
11. `task.py finish`, then archive the child task when closed.
12. Start the next child phase only after the previous phase is committed and
    recorded.

## Phase Roadmap

### Phase 0: Current-State Matrix and Spec Alignment

Deliverables:

- Create a language feature matrix covering AST, parser, diagnostics, references,
  type system, runtime state, semantic diff, exports, storage, CLI, and docs.
- Update stale Trellis specs so package guidance matches program-first reality.
- Define phase-level verification commands and known environmental blockers.

Acceptance:

- Specs no longer describe parser/resolver/compiler as Markdown-first.
- Matrix identifies implemented, partial, missing, and intentionally excluded
  features.
- No product code changes unless needed for tests around the matrix.

Verification:

- `git diff --check`
- targeted docs/spec grep for stale Markdown-first guidance

### Phase 1: Program Contract Hardening

Deliverables:

- Separate legacy compatibility exports from public program-first contracts.
- Audit `@chemd/core` public exports and downstream imports.
- Add tests proving compiler-facing packages consume `ChemdProgramDocument`.

Acceptance:

- Public API has a clear program-first entry point.
- Legacy structures are either removed from compiler-facing exports or explicitly
  quarantined as migration/internal utilities.

Verification:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- downstream typecheck for parser/resolver/typechecker/compiler

### Phase 2: Parser Recovery and Source Map Completeness

Deliverables:

- Improve parser recovery around malformed declarations, values, records, lists,
  doc comments, imports, and procedure controls.
- Add source-span coverage tests for declarations, fields, values, references,
  procedure steps, controls, and agent audit records.
- Expand golden fixtures for valid, warning, and invalid program-v1 cases.

Acceptance:

- Parser diagnostics remain structured and source-ranged.
- Recoverable errors preserve enough AST for resolver/typechecker diagnostics.

Verification:

- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/parser typecheck`
- `pnpm --filter @chemd/compiler test -- language-fixture-matrix.test.ts`

### Phase 3: Project Graph and Dynamic References

Deliverables:

- Promote workspace index into a reusable project graph contract.
- Resolve imports, module aliases, cross-document references, external reaction
  routes, and duplicate IDs through one dependency-aware graph.
- Add reference diagnostics for unresolved, ambiguous, stale, cyclic, and
  incompatible references.

Acceptance:

- A changed document can identify affected downstream documents.
- Reference completion/definition data can be produced without IDE coupling.
- CLI can validate project-level references from a set of files.

Verification:

- `pnpm --filter @chemd/workspace-index test`
- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/cli test`

### Phase 4: Type System and Semantic Constraint Expansion

Deliverables:

- Deepen declaration schemas into a type/constraint registry.
- Validate typed references by target kind and field context.
- Add stronger reaction, material, batch, result, analysis, sample, artifact, and
  condition-screen semantic constraints.
- Normalize semantic facts for quantities, participants, routes, and outcomes.

Acceptance:

- Type errors include expected/actual type facts and source spans.
- Typed graph nodes carry normalized facts needed by exports and runtime.
- Existing exports do not lose fields.

Verification:

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/typechecker typecheck`
- compiler export smoke tests

### Phase 5: Diagnostics, Diagnosis, and Headless Fixes

Deliverables:

- Expand diagnostic registry coverage and quick-fix safety policy.
- Group diagnostics into compiler diagnosis categories with required inputs,
  manual review, safe fixes, and next actions.
- Improve `chemd fix` and `agent-loop` for headless workflows.

Acceptance:

- Every new diagnostic has a spec entry, docs coverage, and tests.
- Safe fixes are hash/range guarded and never rewrite unrelated source.
- CLI JSON output stays deterministic.

Verification:

- `pnpm --filter @chemd/diagnostics test`
- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/cli test`
- docs coverage tests

### Phase 6: Runtime State Stack and Trace Semantics

Deliverables:

- Extend runtime state from current step state into snapshot stack, checkpoints,
  branch/control state, replay checkpoints, and rollback-safe audit events.
- Align procedure-state snapshots, runtime-lab state, and runtime-trace replay.
- Define persistence-ready event and snapshot records without adding DB IO to
  runtime packages.

Acceptance:

- Runtime replay can reconstruct state at any checkpoint.
- Branch/parallel/dynamic controls have explicit state transitions.
- Invalid runtime transitions emit diagnostics, not silent state changes.

Verification:

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/runtime-lab test`
- `pnpm --filter @chemd/runtime-trace test`

### Phase 7: Unified Diff and Incremental Compilation

Deliverables:

- Define source patch, AST diff, semantic diff, runtime diff, and storage diff
  layers.
- Add stable node identities and source hashes for invalidation.
- Introduce incremental compile API that reuses unaffected parse/resolve/type
  artifacts where safe.
- Keep full compile as the source-of-truth fallback.

Acceptance:

- Incremental and full compile outputs match for covered fixture mutations.
- `chemd changed` can report affected declarations and downstream references.
- Diff output has machine-readable schemas and human-readable summaries.

Verification:

- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/cli test`
- targeted mutation fixture tests

### Phase 8: Export, Storage, and Memory-Loop Integration

Deliverables:

- Align JSON, LNF, training, RAG, graph index, reaction map, storage records, and
  memory-loop diffs on the same feature matrix.
- Persist diff/revision concepts as pure storage contracts.
- Ensure exporter-training and storage-postgres consume normalized typed facts,
  not duplicate parser logic.

Acceptance:

- Export schemas have explicit versions and no hidden legacy fields.
- Memory-loop semantic diff can align with CLI semantic diff where appropriate.
- Storage contract tests prove stable SQL/record shape.

Verification:

- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/lnf test`
- `pnpm --filter @chemd/renderer-json test`
- `pnpm --filter @chemd/storage-postgres test`
- `pnpm --filter @chemd/reaction-map test`

### Phase 9: CLI, Docs, and Release Gate

Deliverables:

- Add a CLI feature matrix command or report if useful.
- Update docs/manual only after implementation-backed behavior exists.
- Run broad validation and classify known environment blockers.
- Close the parent task after all child tasks are committed and recorded.

Acceptance:

- User-facing docs describe implemented behavior, not plans.
- Full package test/typecheck/build passes or blockers are documented with exact
  commands and errors.
- Trellis parent and child tasks are recorded, finished, and archived.

Verification:

- `pnpm -r --workspace-concurrency=1 typecheck`
- `pnpm -r --workspace-concurrency=1 test`
- `pnpm -r --workspace-concurrency=1 build`
- `pnpm --filter @chemd/docs typecheck`
- `pnpm --filter @chemd/docs build`
- `git diff --check`

## Dependency Order

```
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
                                   |          |
                                   v          v
                                Phase 7 <- Phase 5
                                   ^
                                   |
                                Phase 6
                                   |
                                   v
                                Phase 8 -> Phase 9
```

Phase 3 and Phase 4 may be partially parallel only after Phase 1 and Phase 2
are complete, but shared schema/type contracts must stay serialized.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Old public exports leak into new work | High | Harden core exports first and add drift tests. |
| Spec guidance contradicts code | High | Phase 0 aligns Trellis specs before implementation. |
| Incremental compile diverges from full compile | High | Full compile remains oracle; mutation fixtures compare outputs. |
| Project graph scope becomes too broad | Medium | Start with import/reference invalidation before rename/refactor. |
| Runtime state stack overreaches into DB runtime | Medium | Keep runtime packages pure; storage contracts only in storage-postgres. |
| Docs claim unimplemented behavior | Medium | Docs updates must be backed by tests or source behavior. |

## Initial Next Step

Create and start child task `language-platform-phase-0-matrix-specs`, then
produce the feature matrix and spec-alignment changes before any feature code.
