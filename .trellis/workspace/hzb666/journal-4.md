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
