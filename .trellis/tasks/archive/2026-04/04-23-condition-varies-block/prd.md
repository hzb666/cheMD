# Condition Varies Block

## Goal

Support an explicit `condition-varies` block for optimization reports. The block records how a candidate/current reaction differs from a standard reaction, and the information must flow into export and training data.

## User Need

Condition optimization reports should not force users to write long prose for experiment intent, variable control, causal comparison, or reference logic. They should be able to add a compact structured block that references the candidate reaction and standard reaction, then lists condition deltas.

## Requirements

- Add `condition-varies` to the Chemd AST and parser.
- Require or preserve references to the candidate/current reaction and the standard reaction.
- Parse condition change fields into structured baseline/candidate deltas where possible.
- Preserve raw authored values for training even when a field cannot be normalized.
- Validate references through the existing typechecker/reference diagnostics path.
- Export the block as a first-class training entity.
- Add semantic links from the condition variation entity to candidate and standard reactions.
- Add training projections for explicit condition variations, variable deltas, references, and relation extraction.
- Keep inferred logic intact while letting explicit authored condition deltas override or enrich training facts.

## Proposed Syntax

```chemd
:::condition-varies #cv-solvent-screen
reaction: rxn-meCN-40c
standard: rxn-standard
solvent: THF -> MeCN
temperature: 25 C -> 40 C
base: K2CO3 -> Cs2CO3
notes: MeCN increased conversion while base loading stayed comparable.
:::
```

## Acceptance Criteria

- Parser returns a `condition_varies` AST node with references, changes, and notes.
- Export record includes `semantic_layer.condition_varies`.
- Export record includes semantic links for candidate and standard reaction references.
- Training understanding includes condition variation entities.
- Training experiment logic includes explicit variable deltas from the block.
- Relation/reference training tasks include condition variation references.
- Focused tests pass for parser and exporter-training.
- Full `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass before commit.
