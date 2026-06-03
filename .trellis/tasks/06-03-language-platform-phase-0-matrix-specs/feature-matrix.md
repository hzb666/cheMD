# Chemd Language Platform Feature Matrix

Status legend:

- Implemented: source-backed behavior exists and has at least focused tests in
  the current platform.
- Partial: source-backed behavior exists, but scope, integration, or verification
  is incomplete for a mature language-platform contract.
- Missing: the feature is part of the parent roadmap but is not yet implemented
  as a reusable contract.
- Excluded: intentionally outside this parent plan.

## Matrix

| Area | Current status | Evidence | Remaining work | Phase |
| --- | --- | --- | --- | --- |
| Program AST | Implemented | `ChemdProgramDocument` uses `chemd-program-ast/v1` and `chemd/program-v1`. | Quarantine legacy public exports and harden compiler-facing imports. | 1 |
| Parser entrypoint | Implemented | `parseChemd` delegates to `parseChemdProgram`; legacy syntax returns diagnostics and an empty program document. | Improve recovery and source-span coverage for malformed program-v1 declarations. | 2 |
| Parser source maps | Partial | Program parser attaches source spans to module/import/meta/declaration fields. | Golden coverage for values, lists, records, references, controls, docs, and audit records. | 2 |
| Resolver symbol table | Partial | `resolveChemd` builds a program symbol table, resolves references, and attaches docs. | Promote imports and cross-document links into a dependency-aware project graph. | 3 |
| Dynamic references | Partial | Local, module, field, and external reference concepts exist in resolver/typechecker pathways. | Add ambiguity, stale, cyclic, incompatible, rename-safety, and downstream invalidation diagnostics. | 3 |
| Workspace index | Partial | Workspace index compiles documents, hashes source, extracts symbols, and resolves reference candidates. | Make project graph reusable outside IDE UI and expose affected-document propagation. | 3 |
| Typechecking | Partial | Typechecker validates declaration schemas, agent runs, typed graph, step graph, and reaction route augmentation. | Add deeper type/constraint registry, normalized facts, and cross-export drift checks. | 4 |
| Diagnostics registry | Partial | `@chemd/diagnostics` classifies syntax/reference/type/quantity/procedure/safety/runtime bands and some quick fixes. | Broaden registry, source spans, grouping, safe-fix rules, docs coverage, and deterministic CLI output. | 5 |
| Compiler pipeline | Implemented | `compileChemd` runs parse, resolve, typecheck, render profile, run plan, preflight, LNF, training/RAG, authoring diagnostics, diagnosis, HTML, JSON, DOCX. | Add reusable incremental compile API while keeping full compile as oracle. | 7 |
| Runtime run plan | Implemented | Runtime lab builds run plans, preflight checks, step states, control states, and lab state. | Extend into snapshot stack, checkpoints, rollback, branching, and persistence-ready audit events. | 6 |
| Runtime trace replay | Partial | Runtime trace adapts lab trace events and can replay step/control status into lab state. | Add checkpoint replay, branch semantics, invalid transition diagnostics, and state reconstruction tests. | 6 |
| Semantic diff | Partial | CLI semantic diff reports added/removed/changed declaration fields with schema `chemd-semantic-diff/v0.1`. | Unify source patch, AST diff, semantic diff, runtime diff, and storage diff contracts. | 7 |
| Incremental compilation | Missing | Workspace index hashes sources but still compiles each document fully. | Reuse unaffected parse/resolve/type artifacts with full compile comparison tests. | 7 |
| Exports | Partial | Compiler produces JSON, DOCX bridge, LNF, training export, RAG export, and training understanding. | Align export schemas with normalized typed facts and remove hidden legacy assumptions. | 8 |
| Storage and memory loop | Partial | Storage package has memory-loop and training-record projections. | Align memory-loop semantic diff with CLI semantic diff and pure storage revision contracts. | 8 |
| CLI workflows | Partial | CLI has validate/check/preflight/export/graph/diff/changed/fix/agent-loop surfaces. | Add project-level reference validation, affected-change reporting, and release-gate matrix reporting where useful. | 3,5,7,9 |
| Docs and Trellis specs | Partial | Program-first task completed and Phase 0 parent roadmap exists. | Remove stale Markdown-first package guidance and keep docs implementation-backed. | 0,9 |
| IDE UI | Excluded | Parent plan explicitly excludes Desktop/Web editor UI. | Keep headless language-service contracts only where needed. | N/A |

## Phase Gates

1. Phase 1 hardens public program contracts before broad feature expansion.
2. Phase 2 improves parser recovery so downstream diagnostics have reliable AST
   and span inputs.
3. Phase 3 establishes project graph and dynamic references before deeper type
   constraints depend on cross-document facts.
4. Phase 4 expands type and semantic constraints using the project graph.
5. Phase 5 broadens diagnostics and headless fixes after parser/type facts are
   stable.
6. Phase 6 expands runtime state and replay independently of IDE UI.
7. Phase 7 unifies diff and incremental compile using stable IDs and source
   hashes from earlier phases.
8. Phase 8 aligns exports, storage, and memory-loop records.
9. Phase 9 closes docs, CLI release gates, broad validation, and parent task
   archival.

## Known Verification Notes

- `pnpm lint` may hit the existing ESLint `scopeManager.addGlobals is not a
  function` toolchain blocker; treat exact occurrences as environment/tooling
  blockers, not proof of feature regressions.
- Phase-specific package tests are preferred while the feature surface is still
  moving.
- Broad validation belongs to Phase 9 after all child tasks are committed.
