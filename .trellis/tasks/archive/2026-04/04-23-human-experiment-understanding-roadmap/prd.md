# brainstorm: human experiment understanding roadmap

## Goal

Define a staged implementation roadmap that closes the gap between Chemd's
current explicit experiment logic compiler and the way human chemists infer
omitted defaults, trace material identity, interpret evidence, and connect
multi-run strategy over time.

## What I already know

* `compileChemd()` already emits `trainingUnderstanding` and
  `trainingExport`, not just AST/parser output.
* `trainingUnderstanding.experiment_logic` already includes design contexts,
  variable logic, causal links, material flow, step dependencies, evidence
  links, and sample lineage.
* `condition-varies` now supports baseline variables, parallel attempts,
  attempt-level references, and training projections.
* The remaining gap to human understanding is mainly in implicit semantics:
  omitted defaults, identity resolution, evidence interpretation, and
  cross-document strategy memory.

## Assumptions (temporary)

* We should optimize for LLM training quality and semantic fidelity, not for
  backward compatibility.
* New author burden should remain low; improvements should prefer inference
  layers and compact syntax over long prose requirements.
* The roadmap should define implementation order, data contracts, and
  acceptance signals before further code changes begin.

## Open Questions

* How much author-facing syntax should be added versus kept implicit?
* Should cross-document continuity live in compile-time export, an indexer, or
  a later dataset builder layer?

## Requirements (evolving)

* Break the work into clear stages with scope, dependencies, and outputs.
* Prioritize the four major gaps:
  * omitted-default recovery
  * stronger sample lineage and artifact semantics
  * field-level source map plus evidence interpretation
  * cross-document experiment trajectory and strategy understanding
* Each stage must have concrete code targets and validation criteria.

## Acceptance Criteria (evolving)

* [x] Roadmap defines stage order and why that order is chosen.
* [x] Each stage names the packages or layers likely to change.
* [x] Each stage includes an MVP boundary and a "not yet" boundary.
* [x] Each stage includes a verification strategy.

## Definition of Done (team quality bar)

* Tests added/updated where behavior changes
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* Immediate implementation of all stages in one task
* Generic free-form scientific reasoning unrelated to experiment records
* Full ontology design for all chemistry domains

## Technical Notes

* Inspected:
  * `packages/exporter-training/src/projections.ts`
  * `.trellis/spec/exporter-training/backend/training-export-contract.md`
  * `docs/chemd-low-cognitive-production-dsl-design.md`
* Relevant existing capabilities:
  * derived design contexts
  * inferred intent hypotheses and causal links
  * material flow graph and step dependencies
  * evidence links and sample lineage
* Implemented in this task:
  * phase 1: `implicit_condition_facts` recovered only from authored
    `condition-varies` baselines or resolved standard reactions
  * phase 2: `sample_profiles` and `artifact_profiles` in
    `trainingUnderstanding.experiment_logic`
  * phase 3: `evidence_interpretations` plus `evidence_interpretation` task
    examples, using evidence-source field refs when available
  * phase 4: cross-document `campaign-projections` builder and
    `cross_document_strategy` task dataset
* Deliberately not implemented:
  * free-text field guessing such as `THF -> solvent`
  * heavyweight chemistry ontology for every instrument/artifact class
  * compile-time cross-document mutation of single-document understanding
