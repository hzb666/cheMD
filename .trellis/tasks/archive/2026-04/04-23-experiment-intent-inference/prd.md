# Experiment Intent Inference

## Goal

Add an automatic experiment-intent and causal-logic inference layer so Chemd
can teach LLMs why an experiment was run, what variables changed, what facts
were controlled, and which evidence supports derived conclusions without
requiring users to write verbose rationale fields in reports.

## Requirements

- Keep user-facing Chemd syntax unchanged for this phase.
- Infer experiment intent and causal/variable logic from existing structured
  entities, relations, outcomes, procedure steps, observations, and evidence.
- Preserve provenance on inferred logic with `logic_source` values such as
  `explicit`, `derived`, or `llm_suggested`.
- Make inferred logic available in `ChemdTrainingUnderstandingV1.experiment_logic`.
- Expose task-projection examples for LLM training only when the input does not
  leak the target answer.
- Update Trellis contracts for the new inference layer.

## Acceptance Criteria

- [x] Training understanding includes intent/causal logic records with stable
  IDs, evidence entity IDs, source, confidence, and review flags.
- [x] Inference works for single-run and variant/baseline experiments.
- [x] Derived logic distinguishes changed variables, controlled variables,
  failure signals, and evidence-backed intent hypotheses.
- [x] Task dataset includes a safe SFT projection for experiment intent or
  causal-logic reasoning.
- [x] Unit tests cover inferred intent, variable/causal records, and leakage
  metadata.
- [x] `pnpm --filter @chemd/exporter-training test`, `pnpm lint`,
  `pnpm typecheck`, and `pnpm test` pass before commit.

## Technical Notes

- Primary implementation package: `packages/exporter-training`.
- Reuse existing `design_contexts`, `outcome_quality`, `failure_signals`,
  `procedure_logic`, and `field_evidence` instead of adding parser syntax.
- Automatic labels remain derived supervision; no inferred record should be
  treated as human-verified.
