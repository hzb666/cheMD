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

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `d3315ee` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 152: Hybrid reaction canonical input task closeout

**Date**: 2026-05-24
**Task**: Hybrid reaction canonical input task closeout
**Package**: desktop
**Branch**: `develop`

### Summary

Marked the phase one Trellis task completed and linked it to the implementation commit after verifying task.py finish only cleared current task state.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `c04dd39` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 153: Hybrid reaction evidence contract

**Date**: 2026-05-24
**Task**: Hybrid reaction evidence contract
**Package**: exporter-training
**Branch**: `develop`

### Summary

Added service job conversion from canonical reaction input, skipped-reaction warnings, provider policy defaults, tests, docs, and completed the phase two Trellis task. Verified exporter-training tests/typecheck, docs typecheck, docs marked examples/coverage, and chem-cluster-service tests.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `bc2d880` | (see git log) |
| `e7ed988` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 154: Hybrid clustering Trellis plan document

**Date**: 2026-05-24
**Task**: Hybrid clustering Trellis plan document
**Package**: desktop
**Branch**: `develop`

### Summary

Recorded the remaining hybrid reaction clustering Trellis plan in docs/chemd-hybrid-reaction-clustering-trellis-plan.zh-CN.md so future sessions can resume after context compression.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9fdd651` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


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
