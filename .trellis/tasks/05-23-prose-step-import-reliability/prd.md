# Prose Step Import Reliability

## Goal

Improve English SI operation import so that procedure actions are not silently
lost. The importer should remain conservative: unknown clauses become
diagnostics or unparsed spans, not invented steps.

This task does not change Chemd language syntax. It improves the lowering
pipeline feeding existing `:::procedure` steps.

## Non-Goals

- Do not change `:::procedure` or `step:` surface syntax.
- Do not add new step families unless they already exist in the step ontology.
- Do not hardcode Chemd field rules in the importer.
- Do not suppress warnings to make output look cleaner.
- Do not introduce an LLM dependency.

## Current Problem

The importer lowers sentences mostly as whole units. If one action in a sentence
is recognized, other actions in the same sentence may be lost without warning.

Example risk:

```text
washed with brine, dried over Na2SO4, filtered, and concentrated
```

Current behavior can produce only `dry` and `concentrate`, silently losing
`wash` and `filter`.

## Architecture

```text
source text
  -> sentence split
  -> clause/action segmentation
  -> action frame extraction
  -> modifier attachment
  -> canonical step lowering
  -> coverage ledger
  -> diagnostics / unparsed spans
```

## Phase 1: Coverage Ledger

### Tasks

- Add an internal coverage model for prose spans:
  - `covered_by_step`
  - `covered_by_observation`
  - `uncovered_action_like`
  - `uncovered_material_like`
  - `ignored_narrative`
- Track source spans per lowered step more precisely.
- Emit warning when action-like text remains uncovered.

### Done Criteria

- A partially parsed sentence can still report unparsed subspans.
- Existing full-sentence unparsed behavior remains.
- No compiler behavior changes.

### Verification

- `pnpm --filter @chemd/importer-prose test`
- `pnpm --filter @chemd/step-ontology test`

## Phase 2: Clause and Action Segmentation

Status: implemented.

### Tasks

- Split SI sentences on action-list boundaries:
  - comma + action
  - `and` + action
  - `then` + action
  - `before/after/followed by`
- Preserve order and source spans.
- Avoid splitting inside balanced parentheses.
- Add tests for 3 to 6 action sentences.

### Done Criteria

- `add -> stir -> warm -> quench -> extract` order is preserved.
- Each clause can independently lower or warn.
- No clause is dropped silently.

### Verification

- `pnpm --filter @chemd/step-ontology test -- lowering.test.ts`
- `pnpm --filter @chemd/importer-prose test`

### Implementation Notes

- Added parser-side clause segmentation after sentence splitting and before
  procedure lowering.
- Split points only apply outside balanced parentheses so concentration,
  solvent-ratio, and quantity commas remain attached to their material mention.
- Unsupported action-like clauses still become low-confidence prose with `W805`.
- Import coverage still emits `W_IMPORT_PROSE_UNCOVERED_ACTION` for action
  keywords that do not become canonical steps.

## Phase 3: High-Frequency Operation Gaps

Status: implemented.

### Tasks

Add or improve lowering for existing step families:

- `wash`: `washed with brine`, `washed with aq. NH4Cl`
- `separate_layers`: `layers were separated`
- `filter`: `filtered`, `filtered through Celite`, `filter cake washed`
- `dry`: `dried over Na2SO4/MgSO4`
- `concentrate`: `in vacuo`, `under reduced pressure`
- `reflux`: map to existing `heat` or `hold` with method, not a new family
- `rt`, `room temperature`, `ambient temperature`
- `overnight`
- `argon`, `air`, `oxygen`, `O2 balloon`, `sealed`, `degassed`

### Done Criteria

- No new Chemd family is required.
- Unknown or unsupported electrochemical/photochemical actions remain
  unparsed with explicit warning unless safely mapped to current families.
- Quantity parameters use existing quantity classes.

### Verification

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/typechecker test`

### Implementation Notes

- `wash`, `dry`, `filter through`, and `concentrate in vacuo` now lower to
  existing step families and schema-backed params.
- `refluxed overnight under argon in a sealed tube` lowers to `heat` with
  `method`, `duration`, `atmosphere`, and `vessel`.
- Bare `filtered` without a known medium is intentionally not filled with a
  fake medium; it remains visible through warnings from the import coverage
  layer.

## Phase 4: Addition versus Quench Attribution

Status: implemented.

### Tasks

- Ensure same-sentence add/quench cases become distinct steps.
- Do not let a later `quenched with H2O` cause earlier `BBr3 was added` to
  become the quench agent.
- Attach modifiers to the nearest compatible action:
  - dropwise -> add
  - at -78 °C -> add/hold context
  - for 10 min -> hold or action duration

### Done Criteria

- `BBr3 was added dropwise ... quenched with H2O` lowers to `add BBr3` and
  `quench H2O`.
- Ambiguous attribution emits a warning.

### Verification

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/importer-prose test`

### Implementation Notes

- `before the addition of ...` is split into its own addition clause so source
  order stays visible.
- Addition temperature and `dropwise` modifiers are attached to the add step
  using existing schema-backed params.
- Condition-looking fragments such as `at -78 °C` are no longer accepted as
  material mentions.

## Phase 5: Purification Detail Preservation

### Tasks

- Preserve chromatography parameters:
  - silica gel
  - eluent
  - ratio
  - gradient
  - prep TLC
  - silica plug
  - trituration
  - recrystallization
- Map to existing `purify` params such as `method`, `technique`, `column`,
  `eluent`, `medium`, and `fraction`.

### Done Criteria

- Purification output compiles against existing step schema.
- Details are not lost into plain prose when they match known params.
- Unsupported details remain in warnings or `message`, not silent omission.

### Verification

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/importer-prose test`

## Phase 6: Documentation and Import CLI Diagnostics

### Tasks

- Update CLI JSON/text summary counts:
  - steps
  - unparsed spans
  - partial coverage warnings
  - ambiguous action warnings
- Update docs with examples and warning policy.

### Done Criteria

- Users can see what was imported and what was not.
- No warning category is hidden in dry-run output.

### Verification

- `pnpm --filter @chemd/cli test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs build`
- `pnpm --filter @chemd/docs typecheck`

## Review Requirements

- Worker ownership may cover `packages/step-ontology` or
  `packages/importer-prose`, but not both in the same phase unless serialized.
- All new rules need regression fixtures.
- Any unsupported action must produce a visible diagnostic.
