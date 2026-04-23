# Condition Variation Parallel Attempts

## Goal

Upgrade `condition-varies` from a single candidate-vs-standard condition
delta into an explicit optimization table model that can define variables,
emit many parallel reaction attempts, and let observations, TLC, analysis, and
notes reference the exact attempt or variable result.

## Requirements

- Support variable definitions under a `condition` field/section.
- Support `varies` entries that either fully override the standard condition or
  only change declared variables.
- Support many parallel attempts such as `var1`, `var2`, each representing one
  reaction attempt.
- Preserve positional matching between attempt IDs and authored result/note
  fields such as `res1`, `note1`.
- Expose stable reference targets so TLC, analysis, phenomenon/observation, and
  other semantic blocks can reference a specific condition variation attempt.
- Connect the new model through AST, parser, typechecker, semantic export,
  training projections, task projections, renderers, storage, and specs.

## Acceptance Criteria

- [ ] Parser accepts both simple legacy deltas and structured variable attempts.
- [ ] Typechecker exposes condition variation attempts as reference targets.
- [ ] Exporter emits condition variables, attempts, result/note evidence, and
      attempt-target relations.
- [ ] Training projections preserve attempt-level logic, resolved references,
      evidence, and task input/output examples.
- [ ] Tests cover variable attempts, result/note matching, and references from
      TLC/analysis/observation-like records to attempts.
- [ ] Relevant Trellis specs document the syntax and contracts.

## Technical Notes

- Keep `condition-varies` authored syntax concise; do not require users to write
  full intent/causal logic by hand.
- Prefer additive fields over breaking existing exports unless existing
  compatibility blocks the best model.
- Use `condition_varies` for the AST node kind and `condition_variation_attempt`
  for attempt-level semantic/training entities.
