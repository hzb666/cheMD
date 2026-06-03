# Journal - hzb666 (Part 4)

> Continuation from `journal-3.md` (archived at ~2000 lines)
> Started: 2026-05-23

---



## Session 140: Phase 2 prose clause segmentation

**Date**: 2026-05-23
**Task**: Phase 2 prose clause segmentation
**Package**: step-ontology
**Branch**: `develop`

### Summary

Split English SI action clauses and preserve visible warnings.

### Main Changes

Phase 2 completed for prose-step-import-reliability.

Changes:
- Added parser-side English clause segmentation outside balanced parentheses.
- Preserved add -> hold -> quench -> extract order for SI action-list prose.
- Added explicit quench agent extraction for `quenched with X` clauses.
- Kept action-like no-canonical clauses visible through W805 and uncovered-action import warnings.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck
- pnpm --filter @chemd/importer-prose test
- pnpm --filter @chemd/importer-prose typecheck
- pnpm chemd import prose <temp-file> --format json --dry-run


### Git Commits

| Hash | Message |
|------|---------|
| `0e767d2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 141: Phase 3 prose operation gaps

**Date**: 2026-05-23
**Task**: Phase 3 prose operation gaps
**Package**: step-ontology
**Branch**: `develop`

### Summary

Lower frequent SI workup and condition phrases through existing step schema.

### Main Changes

Phase 3 completed for prose-step-import-reliability.

Changes:
- Added existing-family lowering for wash, dry-over, filter-through, concentrate-in-vacuo, reflux, overnight, atmosphere, sealed vessel, and separated layers.
- Kept bare `filtered` conservative: no fake medium is generated, so coverage warnings remain visible.
- Updated coverage-ledger tests to reflect wash now being covered while unsupported filter remains uncovered.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck
- pnpm --filter @chemd/importer-prose test
- pnpm --filter @chemd/importer-prose typecheck
- pnpm --filter @chemd/typechecker test
- pnpm --filter @chemd/typechecker typecheck
- pnpm chemd import prose <temp-file> --format json --dry-run


### Git Commits

| Hash | Message |
|------|---------|
| `63de0ff` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 142: Phase 4 addition attribution

**Date**: 2026-05-23
**Task**: Phase 4 addition attribution
**Package**: step-ontology
**Branch**: `develop`

### Summary

Preserve addition ordering and bind modifiers to add steps.

### Main Changes

Phase 4 completed for prose-step-import-reliability.

Changes:
- Split `before the addition of ...` into its own action clause to preserve source order.
- Attached addition temperature and dropwise modifiers to the add step through existing params.
- Prevented condition fragments such as `at -78 °C` from becoming material mentions.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck
- pnpm --filter @chemd/importer-prose test
- pnpm --filter @chemd/importer-prose typecheck
- pnpm chemd import prose <temp-file> --format json --dry-run


### Git Commits

| Hash | Message |
|------|---------|
| `d938244` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 143: Phase 5 purification details

**Date**: 2026-05-23
**Task**: Phase 5 purification details
**Package**: step-ontology
**Branch**: `develop`

### Summary

Preserve purification technique, medium, eluent, and column details.

### Main Changes

Phase 5 completed for prose-step-import-reliability.

Changes:
- Preserved purification details for flash column, prep TLC, silica plug, trituration, and recrystallization.
- Stored eluent ratios and gradient text in the existing `eluent` param instead of adding non-schema fields.
- Avoided treating prep TLC as analytical TLC.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck
- pnpm --filter @chemd/importer-prose test
- pnpm --filter @chemd/importer-prose typecheck
- pnpm --filter @chemd/typechecker test
- pnpm --filter @chemd/typechecker typecheck
- pnpm chemd import prose <temp-file> --format json --dry-run


### Git Commits

| Hash | Message |
|------|---------|
| `e895c62` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 144: Phase 6 import diagnostics docs

**Date**: 2026-05-23
**Task**: Phase 6 import diagnostics docs
**Package**: cli
**Branch**: `develop`

### Summary

Expose prose import warning spans and document review policy.

### Main Changes

Phase 6 completed for prose-step-import-reliability.

Changes:
- CLI text diagnostics now include original prose span text for visible review.
- Added CLI regression for uncovered action warnings and unparsed span counts.
- Updated EN/ZH natural-language-import docs with clause coverage, warning policy, workup, and purification examples.

Verification:
- pnpm --filter @chemd/cli test
- pnpm --filter @chemd/cli typecheck
- pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
- pnpm --filter @chemd/docs typecheck
- pnpm --filter @chemd/docs build

Docs build passed with existing metadataBase warnings from Next.js.


### Git Commits

| Hash | Message |
|------|---------|
| `2710919` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 145: Archive prose step import reliability

**Date**: 2026-05-23
**Task**: Archive prose step import reliability
**Package**: step-ontology
**Branch**: `develop`

### Summary

Archived the completed prose-step-import-reliability task.

### Main Changes

Completed and archived prose-step-import-reliability.

Scope completed:
- Phase 1 coverage ledger.
- Phase 2 clause/action segmentation.
- Phase 3 high-frequency SI operation gaps.
- Phase 4 addition attribution and modifier binding.
- Phase 5 purification detail preservation.
- Phase 6 CLI diagnostics and docs.

Archive commit recorded separately from implementation phase commits.


### Git Commits

| Hash | Message |
|------|---------|
| `6aeb0f8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 146: Plan procedure state model

**Date**: 2026-05-23
**Task**: Plan procedure state model
**Package**: step-ontology
**Branch**: `develop`

### Summary

Created the Procedure State Model PRD and phased plan.

### Main Changes

Created the procedure-state-model Trellis task and PRD.

Plan:
- Phase 1: state model core over canonical steps.
- Phase 2: importer and CLI integration without changing rendered Chemd syntax.
- Phase 3: docs and examples explaining derived review state versus runtime trace.

Boundary:
- No Chemd language-layer syntax changes.
- State derives from canonical steps and schema-backed params.


### Git Commits

| Hash | Message |
|------|---------|
| `2236e1d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 147: Phase 1 procedure state core

**Date**: 2026-05-23
**Task**: Phase 1 procedure state core
**Package**: step-ontology
**Branch**: `develop`

### Summary

Build procedure state snapshots from canonical steps.

### Main Changes

Phase 1 completed for procedure-state-model.

Changes:
- Added `buildProcedureState()` in step-ontology.
- Produced ordered snapshots from canonical steps.
- Tracked vessel contents, active conditions, phase markers, and state warnings.
- Exported the model from the package entrypoint.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck


### Git Commits

| Hash | Message |
|------|---------|
| `7aa5a00` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 148: Phase 2 procedure state import integration

**Date**: 2026-05-23
**Task**: Phase 2 procedure state import integration
**Package**: cli
**Branch**: `develop`

### Summary

Expose derived procedure state through importer and CLI reports.

### Main Changes

Phase 2 completed for procedure-state-model.

Changes:
- Added `procedureState` to prose import candidates.
- Converted state model warnings into import diagnostics.
- Added `stateSnapshotCount` and `stateWarningCount` to CLI JSON/text reports.
- Kept rendered `.chemd` draft syntax unchanged.

Verification:
- pnpm --filter @chemd/step-ontology test
- pnpm --filter @chemd/step-ontology typecheck
- pnpm --filter @chemd/importer-prose test
- pnpm --filter @chemd/importer-prose typecheck
- pnpm --filter @chemd/cli test
- pnpm --filter @chemd/cli typecheck
- pnpm chemd import prose <temp-file> --format json --dry-run


### Git Commits

| Hash | Message |
|------|---------|
| `f8a09e8` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 149: Phase 3 procedure state docs

**Date**: 2026-05-23
**Task**: Phase 3 procedure state docs
**Package**: step-ontology
**Branch**: `develop`

### Summary

Document derived procedure state review data and examples.

### Main Changes

Phase 3 completed for procedure-state-model.

Changes:
- Documented operation steps versus derived procedure state versus runtime trace.
- Added EN/ZH examples showing the empty-vessel state stack evolving after imported steps.
- Documented warning policy for unsupported state transitions.

Verification:
- pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts
- pnpm --filter @chemd/docs typecheck
- pnpm --filter @chemd/docs build

Docs build exited 0. It still printed existing metadataBase warnings and transient fonts.gstatic.com ECONNRESET messages.


### Git Commits

| Hash | Message |
|------|---------|
| `72c0f78` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 150: Archive procedure state model

**Date**: 2026-05-23
**Task**: Archive procedure state model
**Package**: step-ontology
**Branch**: `develop`

### Summary

Archived the completed procedure-state-model task.

### Main Changes

Completed and archived procedure-state-model.

Scope completed:
- Phase 1 state model core over canonical procedure steps.
- Phase 2 importer and CLI integration.
- Phase 3 EN/ZH docs and review examples.

Archive commit recorded separately from implementation phase commits.


### Git Commits

| Hash | Message |
|------|---------|
| `5bd46eb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 151: Hybrid reaction canonical input

**Date**: 2026-05-24
**Task**: Hybrid reaction canonical input
**Package**: desktop
**Branch**: `develop`

### Summary

Added graph-derived canonical reaction intelligence input, explicit missing canonical SMILES warnings, tests, and EN/ZH docs. Verified exporter-training tests/typecheck, docs typecheck, docs coverage examples, and git diff check.

### Main Changes

- Replaced compiler entrypoint with program-first
  parse/resolve/typecheck pipeline.
- Added temporary program semantic layer for training export
  while renderer/LNF/export packages wait for Phase 5.
- Updated CLI validate/check/export/diff/changed/graph paths
  to report program declarations and ignore `.chemd.md`.
- Reworked authoring, repair, quick-fix, compiler tests,
  fixtures, importer output, and apps/docs examples for
  program syntax.

### Git Commits

| Hash | Message |
|------|---------|
| `d3315ee` | (see git log) |

### Testing

- [OK] `pnpm --filter @chemd/compiler test`
- [OK] `pnpm --filter @chemd/compiler typecheck`
- [OK] `pnpm --filter @chemd/cli test`
- [OK] `pnpm --filter @chemd/cli typecheck`
- [OK] `pnpm --filter @chemd/parser test`
- [OK] `pnpm --filter @chemd/resolver test`
- [OK] `pnpm --filter @chemd/typechecker test`
- [OK] `pnpm --filter @chemd/importer-prose test`
- [OK] `pnpm --filter @chemd/importer-prose typecheck`
- [OK] `pnpm --filter @chemd/exporter-training typecheck`
- [OK] `pnpm --filter @chemd/docs typecheck`
- [OK] `pnpm --filter @chemd/docs build`
- [OK] `pnpm chemd validate packages/compiler/fixtures/program-golden-suzuki-screen.chemd`
- [OK] `git diff -- docs --name-only`
- [OK] `git diff --check`
- Deferred: `pnpm --filter @chemd/exporter-training test`
  still targets legacy frontmatter and `:::` fixtures; this is
  Phase 5 scope.

### Status

[OK] **Completed**

### Next Steps

- Start Phase 5 renderer/export/LNF migration.


## Session 152: Hybrid reaction canonical input task closeout

**Date**: 2026-05-24
**Task**: Hybrid reaction canonical input task closeout
**Package**: desktop
**Branch**: `develop`

### Summary

Marked the phase one Trellis task completed and linked it to the implementation commit after verifying task.py finish only cleared current task state.

### Main Changes

- Added `ProgramRenderDocument` and routed HTML/JSON/DOCX exports through
  program-native declarations, documentation blocks, procedures, traces, and
  agent audit sections.
- Upgraded JSON export, DOCX bridge, LNF, training export, and RAG chunk
  contracts to `chemd-program-json/v1`, DOCX `v1.0`, `chemd-lnf/v1.0`, and
  `chemd-training-export/v0.3`.
- Updated compiler/CLI integration, exporter-training projections,
  storage/language-service Graph/RAG fallout, and `apps/docs` export docs.
- Confirmed root `docs/` was not modified.

### Git Commits

| Hash | Message |
|------|---------|
| `c04dd39` | (see git log) |

### Testing

- [OK] `pnpm --filter @chemd/compiler test`
- [OK] `pnpm --filter @chemd/compiler typecheck`
- [OK] `pnpm --filter @chemd/cli test`
- [OK] `pnpm --filter @chemd/cli typecheck`
- [OK] `pnpm --filter @chemd/semantic-rendering test`
- [OK] `pnpm --filter @chemd/semantic-rendering typecheck`
- [OK] `pnpm --filter @chemd/renderer-html test`
- [OK] `pnpm --filter @chemd/renderer-html typecheck`
- [OK] `pnpm --filter @chemd/renderer-json test`
- [OK] `pnpm --filter @chemd/renderer-json typecheck`
- [OK] `pnpm --filter @chemd/renderer-docx test`
- [OK] `pnpm --filter @chemd/renderer-docx typecheck`
- [OK] `pnpm --filter @chemd/lnf test`
- [OK] `pnpm --filter @chemd/lnf typecheck`
- [OK] `pnpm --filter @chemd/exporter-training test`
  (legacy exporter fixture suites intentionally skipped)
- [OK] `pnpm --filter @chemd/exporter-training typecheck`
- [OK] `pnpm --filter @chemd/storage-postgres test`
- [OK] `pnpm --filter @chemd/storage-postgres typecheck`
- [OK] `pnpm --filter @chemd/language-service typecheck`
- [OK] `pnpm --filter @chemd/desktop typecheck`
- [OK] `pnpm --filter @chemd/docs typecheck`
- [OK] `pnpm --filter @chemd/docs build`
- [OK] CLI export smoke for JSON, LNF, training export, and RAG
- [OK] `git diff -- docs --name-only`
- [OK] `git diff --check`
- [DEFERRED] `pnpm --filter @chemd/language-service test` and
  `pnpm --filter @chemd/desktop test` still use old `:::` editor/workspace
  fixtures and move to Phase 6.

### Status

[OK] **Completed**

### Next Steps

- Start Phase 6 for language service, Desktop IDE, and storage/UI fixtures.


## Session 153: Hybrid reaction evidence contract

**Date**: 2026-05-24
**Task**: Hybrid reaction evidence contract
**Package**: exporter-training
**Branch**: `develop`

### Summary

Added service job conversion from canonical reaction input, skipped-reaction warnings, provider policy defaults, tests, docs, and completed the phase two Trellis task. Verified exporter-training tests/typecheck, docs typecheck, docs marked examples/coverage, and chem-cluster-service tests.

### Main Changes

- Added `ProgramRenderDocument` and moved HTML/JSON/DOCX render/export paths
  to program declarations, doc comments, procedures, traces, and agent audit
  sections.
- Upgraded program JSON, DOCX bridge, LNF, training export, and RAG chunks to
  `chemd-program-json/v1`, DOCX `v1.0`, `chemd-lnf/v1.0`, and
  `chemd-training-export/v0.3`.
- Updated compiler/CLI integration, exporter-training projections,
  storage/language-service Graph/RAG fallout, and `apps/docs` export docs.
- Confirmed root `docs/` was not modified.

### Git Commits

| Hash | Message |
|------|---------|
| `bc2d880` | (see git log) |
| `e7ed988` | (see git log) |

### Testing

- [OK] compiler, CLI, renderer, semantic-rendering, LNF, exporter-training,
  storage-postgres, docs typecheck/build, and export smoke checks.
- [OK] `git diff -- docs --name-only`
- [OK] `git diff --check`
- [DEFERRED] language-service and desktop legacy `:::` fixture cleanup moved
  to Phase 6/7.

### Status

[OK] **Completed**

### Next Steps

- Continue Phase 6 for language service, Desktop IDE, storage, and web.


## Session 154: Hybrid clustering Trellis plan document

**Date**: 2026-05-24
**Task**: Hybrid clustering Trellis plan document
**Package**: desktop
**Branch**: `develop`

### Summary

Recorded the remaining hybrid reaction clustering Trellis plan in docs/chemd-hybrid-reaction-clustering-trellis-plan.zh-CN.md so future sessions can resume after context compression.

### Main Changes

- Added program declaration/source-range helpers for language-service outline,
  symbols, completion, hover, definition, semantic tokens, workspace references,
  diagnostics, and Graph/RAG records.
- Updated Desktop IDE semantic preview, knowledge map, reaction intelligence,
  workspace index, persistence tests, and bundled `.chemd` samples to
  program-first compile output.
- Migrated storage-postgres and web/playground JSON/DOCX/Postgres training
  export paths to training export v0.3 and program declaration/doc contracts.
- Updated web Next 16 build config so `pnpm --filter @chemd/web build` uses
  the existing webpack config explicitly.
- Confirmed root `docs/` was not modified.

### Git Commits

| Hash | Message |
|------|---------|
| `9fdd651` | (see git log) |

### Testing

- [OK] `pnpm --filter @chemd/language-service test`
- [OK] `pnpm --filter @chemd/language-service typecheck`
- [OK] `pnpm --filter @chemd/desktop test`
- [OK] `pnpm --filter @chemd/desktop typecheck`
- [OK] `pnpm --filter @chemd/storage-postgres test`
- [OK] `pnpm --filter @chemd/storage-postgres typecheck`
- [OK] `pnpm --filter @chemd/web test`
- [OK] `pnpm --filter @chemd/web typecheck`
- [OK] `pnpm --filter @chemd/web build`
- [OK] `pnpm --filter @chemd/compiler test`
- [OK] `pnpm --filter @chemd/compiler typecheck`
- [OK] `pnpm --filter @chemd/cli test`
- [OK] `pnpm --filter @chemd/cli typecheck`
- [OK] `pnpm --filter @chemd/docs typecheck`
- [OK] `pnpm --filter @chemd/docs build`
- [OK] `git diff -- docs --name-only`
- [OK] `git diff --check`

### Status

[OK] **Completed**

### Next Steps

- Continue Phase 7 full cleanup: delete legacy parser/files/tests and remove
  remaining `:::` dependencies.


## Session 155: Hybrid reaction similarity scoring

**Date**: 2026-05-24
**Task**: Hybrid reaction similarity scoring
**Package**: exporter-training
**Branch**: `develop`

### Summary

Added weighted hybrid similarity contributions, updated chemistry-first weights, added reaction-center hard-reject warning, updated contract validation and docs. Verified chem-cluster-service tests, exporter-training tests/typecheck, docs typecheck, docs coverage examples, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e21aca7` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 156: Hybrid reaction strict clusters

**Date**: 2026-05-24
**Task**: Hybrid reaction strict clusters
**Package**: exporter-training
**Branch**: `develop`

### Summary

Phase 4 added strict reaction clusters, candidate neighbors, semantic groups, exporter-training merge support, docs, and validation. Verified python unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/exporter-training test; pnpm --filter @chemd/exporter-training typecheck; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `77ab2e5` | (see git log) |
| `d710fa4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 157: Hybrid reaction cluster profiles

**Date**: 2026-05-24
**Task**: Hybrid reaction cluster profiles
**Package**: exporter-training
**Branch**: `develop`

### Summary

Phase 5 added strict reaction cluster profiles for LLM and training use without changing cluster decisions. Verified pnpm --filter @chemd/exporter-training test; pnpm --filter @chemd/exporter-training typecheck; pnpm --filter @chemd/docs typecheck; python -m unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `43433d2` | (see git log) |
| `59c88ac` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 158: Hybrid reaction clustering user contract

**Date**: 2026-05-24
**Task**: Hybrid reaction clustering user contract
**Package**: cli
**Branch**: `develop`

### Summary

Phase 6 made CLI text and docs distinguish semantic graph-index clusters from strict computed reaction-intelligence outputs. Verified pnpm --filter @chemd/cli test; pnpm --filter @chemd/cli typecheck; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b357782` | (see git log) |
| `a78a7b3` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 159: Hybrid reaction clustering gold corpus

**Date**: 2026-05-24
**Task**: Hybrid reaction clustering gold corpus
**Package**: web
**Branch**: `develop`

### Summary

Phase 7 added deterministic gold corpus cases for strict computed clusters, semantic-only groups, hard rejects, and skipped provider warnings. Verified python -m unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/exporter-training test; pnpm --filter @chemd/exporter-training typecheck; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `515a0ce` | (see git log) |
| `0e9ceda` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 160: Hybrid reaction clustering final review

**Date**: 2026-05-24
**Task**: Hybrid reaction clustering final review
**Package**: web
**Branch**: `develop`

### Summary

Phase 8 completed final drift audit, documented naming consistency, and tracked the hybrid clustering math TeX appendix. Verified python -m unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/exporter-training test; pnpm --filter @chemd/exporter-training typecheck; pnpm --filter @chemd/cli test; pnpm --filter @chemd/cli typecheck; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a01537a` | (see git log) |
| `a827460` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 161: RDKit composite reaction fingerprint

**Date**: 2026-05-24
**Task**: RDKit composite reaction fingerprint
**Package**: web
**Branch**: `develop`

### Summary

Replaced RDKit Morgan side-XOR fingerprint with rdkit_reaction_composite_6144_v2: path1024+Morgan1024 reactant/product/change blocks and weighted block Tanimoto. Updated artifact fixture, service contract metadata, docs, and math appendix. Verified python -m unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8a760e4` | (see git log) |
| `999de47` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 162: RDKit directional reaction fingerprint

**Date**: 2026-05-24
**Task**: RDKit directional reaction fingerprint
**Package**: web
**Branch**: `develop`

### Summary

Changed RDKit reaction fingerprints from XOR change blocks to directional gained/lost blocks. The provider now emits rdkit_reaction_directional_8192_v3 with reactant, product, gained, and lost blocks, and computes weighted per-block Tanimoto. Verified python -m unittest discover services/chem-cluster-service/tests; pnpm --filter @chemd/docs typecheck; pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts; git diff --check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `f142333` | (see git log) |
| `912be1d` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 163: Phase 0 program-first contract

**Date**: 2026-05-28
**Task**: Phase 0: Program-first breaking-change spec
**Package**: core
**Branch**: `develop`

### Summary

Published program-v1 language, AST, and export contracts in apps/docs, updated README positioning, completed the Phase 0 Trellis task, and verified docs coverage, docs typecheck, docs build, and diff whitespace checks.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `454aad1` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 164: Phase 1 core program AST

**Date**: 2026-05-28
**Task**: Phase 1 core program AST
**Package**: core
**Branch**: `develop`

### Summary

Added additive program-first core AST and declaration schema contracts with focused tests and Trellis Phase 1 status.

### Main Changes

- Introduced additive program-first AST contracts under packages/core/src/program-ast.
- Added declaration schema and program-specific declaration value schema helpers.
- Exported the new contracts from @chemd/core while preserving legacy AST/block-schema APIs.
- Added focused core tests for program document shape, reference forms, doc attachments, and declaration schema lookup.
- Addressed read-only review findings before commit: program reference targets, agent cancelled status, and documented reference raw syntax.

Verification:
- pnpm --filter @chemd/core test: passed, 1 file / 15 tests.
- pnpm --filter @chemd/core typecheck: passed.
- python .trellis\scripts\task.py validate .trellis\tasks\05-28-program-first-phase-1-core-ast: passed.
- git diff --check: passed with CRLF warnings only.


### Git Commits

| Hash | Message |
|------|---------|
| `00bb45b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 165: Phase 2 parser replacement

**Date**: 2026-05-28
**Task**: Phase 2 parser replacement
**Package**: parser
**Branch**: `develop`

### Summary

Switched @chemd/parser to the program-first parse path with lexer, value/doc/declaration/procedure/agent parsing and program tests.

### Main Changes

- Replaced @chemd/parser public parseChemd entrypoint with parseChemdProgram.
- Added program lexer, token model, value parser, doc comment parser, and legacy syntax fatal diagnostics.
- Added program parser support for module/import/meta declarations, field declarations, procedure steps, and agent run entries.
- Removed legacy parser tests that asserted frontmatter, ::: blocks, template/use, nested legacy blocks, and document.children behavior.
- Added program parser tests for values, docs, imports/module refs, malformed blocks, procedure, and agent runs.
- Addressed review findings: import alias reference context, import doc comments, grouped line docs, missing closing brace diagnostics, and decision block spans.

Verification:
- pnpm --filter @chemd/parser test: passed, 4 files / 12 tests.
- pnpm --filter @chemd/parser typecheck: passed.
- pnpm --filter @chemd/core typecheck: passed.
- python .trellis\scripts\task.py validate .trellis\tasks\05-28-program-first-phase-2-parser: passed.
- git diff --check: passed with CRLF warnings only.


### Git Commits

| Hash | Message |
|------|---------|
| `a865a6c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 166: Phase 3 resolver and typechecker

**Date**: 2026-05-29
**Task**: Phase 3 resolver and typechecker
**Package**: core
**Branch**: `develop`

### Summary

Replaced resolver/typechecker with program-first symbol resolution, schema validation, typed graph generation, route augmentation, procedure control lowering, and agent timeline validation.

### Main Changes

Phase 3 completed resolver/typechecker replacement.

Commit: ea02a77

Scope:
- Replaced resolver public path with ChemdProgramDocument symbols and reference resolution.
- Replaced typechecker public path with program declaration schema validation and typed graph generation.
- Added program reaction route augmentation with external route context.
- Added agent audit timeline parsing and terminal status validation.
- Added recursive procedure control lowering.
- Removed legacy resolver/typechecker traversal helpers and tests from public Phase 3 paths.

Review:
- Subagent 019e6f44-1055-75e1-8453-7d178485d926 reviewed Phase 3.
- Addressed route options/next/cycle/orphan coverage.
- Addressed agent terminal timeline parse/positive coverage.
- Addressed nested procedure control lowering coverage.
- Kept legacy type aliases only for temporary compatibility while adding ProgramSourceMetadata.

Verification:
- pnpm --filter @chemd/resolver test
- pnpm --filter @chemd/resolver typecheck
- pnpm --filter @chemd/typechecker test
- pnpm --filter @chemd/typechecker typecheck
- pnpm --filter @chemd/parser test
- pnpm --filter @chemd/parser typecheck
- pnpm --filter @chemd/core test
- pnpm --filter @chemd/core typecheck
- git diff --check
- git diff -- docs apps\docs --name-only


### Git Commits

| Hash | Message |
|------|---------|
| `ea02a77` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 167: Phase 4 compiler pipeline replacement

**Date**: 2026-05-29
**Task**: Phase 4 compiler pipeline replacement
**Package**: compiler
**Branch**: `develop`

### Summary

Replaced compiler and CLI integration with program-first parse/resolve/typecheck contracts; updated authoring, tests, apps/docs, and Trellis Phase 4 state.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `331adbe` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 168: Phase 5 renderer and export replacement

**Date**: 2026-05-29
**Task**: Phase 5 renderer and export replacement
**Package**: compiler
**Branch**: `develop`

### Summary

Replaced program-native renderer/export contracts, LNF v1.0, training export v0.3, RAG chunk typing, apps/docs export pages, and downstream Graph/RAG fallout.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `b165692` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 169: Phase 6 IDE storage language-service migration

**Date**: 2026-05-29
**Task**: Phase 6 IDE storage language-service migration
**Package**: desktop
**Branch**: `develop`

### Summary

Migrated language-service, Desktop IDE, storage, and web/playground surfaces to program declarations, source ranges, training export v0.3, and program JSON contracts.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `8a5637a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 170: Phase 7 full program-first cleanup

**Date**: 2026-05-29
**Task**: Phase 7 full program-first cleanup
**Package**: compiler
**Branch**: `develop`

### Summary

Completed the final program-first cleanup: removed legacy fenced-block parser and fixtures, tightened program-native compiler/render/export/IDE/docs contracts, closed Phase 7 and parent Trellis task, and verified typecheck/test/build with documented lint/Rust blockers.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1b5ba6b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 171: Docs comparison against program rewrite plan

**Date**: 2026-05-29
**Task**: Docs comparison against program rewrite plan
**Package**: compiler
**Branch**: `develop`

### Summary

Compared the implementation plan against apps/docs, fixed remaining program-v1 documentation drift, added the missing ZH agent run example, clarified removed legacy syntax, and verified docs typecheck/build plus docs coverage.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `5560a42` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 172: Phase 0 language platform matrix and spec alignment

**Date**: 2026-06-03
**Task**: Phase 0 language platform matrix and spec alignment
**Package**: compiler
**Branch**: `develop`

### Summary

Created the language-platform parent plan and Phase 0 child task, added the feature matrix, and aligned parser/resolver/compiler Trellis specs to the program-first pipeline.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `af3ad03` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 173: Phase 1 program contract hardening

**Date**: 2026-06-03
**Task**: Phase 1 program contract hardening
**Package**: core
**Branch**: `develop`

### Summary

Hardened @chemd/core public contracts by adding program and compat subpath surfaces, removing older AST/block-schema exports from root, and migrating compatibility consumers while keeping core and compiler-facing typechecks passing.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `38cc7ef` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 174: Phase 2 parser recovery and source maps

**Date**: 2026-06-03
**Task**: Phase 2 parser recovery and source maps
**Package**: parser
**Branch**: `develop`

### Summary

Hardened program parser recovery and full-document value source maps; verified parser tests, parser typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c919ab4` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 175: Phase 3 resolver dynamic references

**Date**: 2026-06-03
**Task**: Phase 3 resolver dynamic references
**Package**: resolver
**Branch**: `develop`

### Summary

Added recursive resolver support for ChemdPatchExpr values and regression coverage for patch expression references; verified resolver tests, resolver typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7829c15` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 176: Phase 4 compiler authoring hints

**Date**: 2026-06-03
**Task**: Phase 4 compiler authoring hints
**Package**: compiler
**Branch**: `develop`

### Summary

Mapped compiler authoring quick-fix diagnostics to program source spans and wired compileChemd to pass the program document; verified authoring diagnostics, authoring assistance, quick-fix, repair-loop tests, compiler fixture matrix, compiler typecheck, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ee98bfc` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 177: Phase 5 state trace and semantic diff

**Date**: 2026-06-03
**Task**: Phase 5 state trace and semantic diff
**Package**: runtime-lab
**Branch**: `develop`

### Summary

Added runtime-lab state stack snapshots, replay current-step restoration, and unified CLI semantic diff through the shared diff implementation; verified runtime-lab, runtime-trace, CLI semantic diff/CLI tests, typechecks, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `66a65fb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 178: Phase 6 typechecker semantic graph hardening

**Date**: 2026-06-03
**Task**: Phase 6 typechecker semantic graph hardening
**Package**: typechecker
**Branch**: `develop`

### Summary

Added V03Diagnostic sourceSpan support and mapped typechecker program diagnostics to declaration, field, and nested value source spans; verified diagnostics/typechecker/language-service typechecks, typechecker tests, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ab44ced` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 179: Phase 7 LNF exporter completeness

**Date**: 2026-06-03
**Task**: Phase 7 LNF exporter completeness
**Package**: lnf
**Branch**: `develop`

### Summary

Extended LNF source completeness to count unresolved references in agent tool args/output, evidence, patch edit values, patch evidence, and audit timeline evidence; verified LNF tests/typecheck, exporter v0.3 tests/typecheck, compiler matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `7127147` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 180: Phase 8 language service diagnostic ranges

**Date**: 2026-06-03
**Task**: Phase 8 language service diagnostic ranges
**Package**: compiler
**Branch**: `develop`

### Summary

Preserved source-mapped compiler/typechecker diagnostic ranges through language-service compile output; verified language-service tests/typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `ddbe962` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 181: Phase 9 exporter training diagnostic evidence

**Date**: 2026-06-03
**Task**: Phase 9 exporter training diagnostic evidence
**Package**: exporter-training
**Branch**: `develop`

### Summary

Merged typedGraph diagnostics into exporter-training outputs and preserved diagnostic source evidence fields; verified exporter-training tests/typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `cf251b2` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 182: Phase 10 typechecker upstream diagnostic spans

**Date**: 2026-06-03
**Task**: Phase 10 typechecker upstream diagnostic spans
**Package**: compiler
**Branch**: `develop`

### Summary

Preserved upstream diagnostic sourceSpan through typechecker diagnostics; verified typechecker tests/typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c9c9ffb` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 183: Phase 11 workspace index AST references

**Date**: 2026-06-03
**Task**: Phase 11 workspace index AST references
**Package**: compiler
**Branch**: `develop`

### Summary

Added AST-derived program references to workspace indexing while preserving text fallback and avoiding string false positives; verified workspace-index tests/typecheck, language-service typecheck, compiler fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `a051a13` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 184: Phase 12 compiler diagnostic dedupe

**Date**: 2026-06-03
**Task**: Phase 12 compiler diagnostic dedupe
**Package**: compiler
**Branch**: `develop`

### Summary

Deduplicated compiler diagnostic merges so upstream resolver/parser diagnostics are not repeated after typechecker aggregation; verified compiler tests/typecheck, fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `be5a165` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 185: Phase 13 pure core compiler entry

**Date**: 2026-06-04
**Task**: Phase 13 pure core compiler entry
**Package**: compiler
**Branch**: `develop`

### Summary

Added compileChemdCore for language-core compilation without training/RAG outputs while preserving compileChemd compatibility; verified compiler targeted tests, typecheck, fixture matrix, Trellis validation, and diff check.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `e51c94b` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
