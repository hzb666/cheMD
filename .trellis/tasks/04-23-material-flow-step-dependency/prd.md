# Material Flow and Step Dependency Export

## Goal

Export explicit material flow and procedural dependency graphs from existing
resolved experiment records so training data can teach LLMs how samples,
reagents, evidence, and operations depend on one another without requiring users
to write extra rationale fields.

## Requirements

- Derive material flow nodes/edges from reactions, participants, products,
  samples, procedure steps, evidence links, and sample lineage already present in
  resolved records.
- Derive step dependency edges from procedure order, shared materials, produced
  samples, consumed samples, and evidence-producing steps.
- Mark inferred graph edges as derived with confidence and evidence references.
- Add a dedicated training task projection that asks models to reconstruct
  material flow and step dependencies from non-target inputs.
- Update exporter contract documentation and regression tests.

## Acceptance Criteria

- [x] `TrainingExperimentLogicV1` includes material flow and step dependency
  graph fields.
- [x] Exported graph entries have stable IDs, source metadata, confidence, and
  review semantics.
- [x] LoRA/task export includes a graph-reasoning task without leaking the target
  graph in its input.
- [x] Tests cover reaction material flow, procedure step dependencies, sample
  lineage, and graph task leakage constraints.
- [x] `pnpm --filter @chemd/exporter-training test` passes.
- [x] `pnpm --filter @chemd/exporter-training typecheck` passes.

## Technical Notes

- Keep this phase in `packages/exporter-training`; do not change parser grammar
  or resolver contracts unless an existing field is demonstrably insufficient.
- Prefer conservative derived edges over speculative inference.
- If evidence is weak or purely positional, set `review_required: true`.
