# Procedure State Model

## Goal

Build a state model from canonical procedure steps so prose imports can be
reviewed as an ordered experiment process: an initially empty vessel is charged,
then materials, phases, conditions, workup operations, and outputs evolve step
by step.

This task does not change Chemd syntax or parser/typechecker language rules.
It consumes canonical steps produced by `@chemd/step-ontology` and imported by
`@chemd/importer-prose`.

## Non-Goals

- Do not add a new Chemd block or `step:` surface syntax.
- Do not model runtime execution or robot device state.
- Do not infer exact chemistry beyond explicit step params.
- Do not silently create missing materials, phases, or outputs.
- Do not replace existing `runtime-lab` or `runtime-trace`; this is an import
  review model, not an execution engine.

## Architecture

```text
canonical steps
  -> state events
  -> vessel/material/condition/phase snapshots
  -> warnings for unsupported or ambiguous state transitions
  -> optional importer diagnostics / review summary
```

The state model is intentionally derived from language-layer canonical steps.
Importers and docs should call this model instead of duplicating step semantics.

## Phase 1: State Model Core

Status: implemented.

### Tasks

- Add a pure state builder for `CanonicalStepNode[]`.
- Track ordered snapshots:
  - vessel contents
  - materials added or removed
  - active temperature, atmosphere, and duration context
  - workup phase markers
  - outputs/artifacts when explicitly present
- Emit warnings for steps that cannot be represented as a state transition.
- Keep all state facts provenance-linked to the source step.

### Done Criteria

- A step list lowers to deterministic snapshots.
- Unsupported transitions are warnings, not dropped facts.
- No Chemd language-layer files are changed.

### Verification

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/step-ontology typecheck`

### Implementation Notes

- Added a pure `buildProcedureState()` helper over canonical steps.
- State snapshots track contents, active conditions, phase markers, source
  step ids, and state-model warnings.
- Unsupported families are represented as warnings instead of being silently
  dropped.

## Phase 2: Importer Integration

Status: implemented.

### Tasks

- Add procedure state output to prose import candidates.
- Include state warnings in import diagnostics.
- Expose summary counts in CLI JSON/text without changing `.chemd` rendering.
- Keep rendered Chemd source unchanged unless existing steps changed upstream.

### Done Criteria

- Import results can show procedure state without inventing Chemd syntax.
- State warnings are visible in CLI/import diagnostics.
- Existing importer tests keep passing.

### Verification

- `pnpm --filter @chemd/importer-prose test`
- `pnpm --filter @chemd/importer-prose typecheck`
- `pnpm --filter @chemd/cli test`

### Implementation Notes

- Prose import candidates now include `procedureState`.
- CLI JSON/text exposes `stateSnapshotCount` and `stateWarningCount`.
- State warnings are converted into import diagnostics while rendered Chemd
  remains normal `:::procedure` syntax.

## Phase 3: Docs and Review Examples

Status: planned.

### Tasks

- Document the difference between operation steps, procedure state, and runtime
  trace.
- Add EN/ZH examples showing the state stack for an SI paragraph.
- Explain warning policy for unsupported state transitions.

### Done Criteria

- Docs are user-facing and do not expose implementation paths.
- The state model is described as derived review data, not as syntax.

### Verification

- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs typecheck`
- `pnpm --filter @chemd/docs build`

## Review Requirements

- Use canonical step schemas as the source of truth.
- Do not duplicate parser grammar or Chemd block-field rules.
- Keep state transitions conservative and deterministic.
- Add regression tests for every supported transition family.
