# Reference and Relation Training Tasks

## Goal

Generate dedicated supervised examples for reference resolution and semantic
relation extraction from `ChemdTrainingUnderstandingV1`, so LLM training data
teaches how Chemd references, relation roles, and unresolved references work.

## Requirements

- Add `reference_resolution` and `relation_extraction` to task dataset examples.
- Keep examples derived from `ChemdTrainingUnderstandingV1`, not raw source or
  audit exports.
- Inputs must include source facts needed to solve the task without exposing the
  target answer object wholesale.
- Outputs must carry resolved reference targets or relation tuples with stable
  IDs.
- Mark derived labels with SFT/eval/holdout metadata and conservative leakage
  risk.
- Update exporter contract docs and regression tests.

## Acceptance Criteria

- [x] `ExperimentDecisionTaskTypeV1` supports `reference_resolution` and
  `relation_extraction`.
- [x] Dataset generation emits reference-resolution examples when
  `resolved_references` exist.
- [x] Dataset generation emits relation-extraction examples when semantic
  relations exist.
- [x] Prompts do not include full `resolved_references` or `relations` target
  arrays.
- [x] Tests cover resolved, unresolved, and relation extraction examples.
- [x] `pnpm --filter @chemd/exporter-training test` passes.
- [x] `pnpm --filter @chemd/exporter-training typecheck` passes.

## Technical Notes

- Keep examples SFT-only by default for unresolved or mixed derived references.
- Eval eligibility can be allowed only for direct, warning-free resolved
  references/relations with low leakage.
