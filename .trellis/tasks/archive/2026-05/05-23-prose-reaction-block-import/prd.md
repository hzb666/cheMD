# Prose Reaction Block Import

## Goal

Generate conservative `:::chemd kind: reaction` blocks from ordinary English SI
procedure text while preserving the existing `:::procedure` output and without
changing the Chemd language layer.

The importer must use Chemd as the source of truth:

- field validity comes from `@chemd/core` block schema helpers
- step parameter validity comes from `@chemd/step-ontology`
- final drafts are validated by `@chemd/compiler`
- semantic/training export behavior is verified, not reimplemented

## Non-Goals

- Do not change parser syntax, block schema, field schema, or quantity grammar.
- Do not make the importer a second Chemd language definition.
- Do not write low-confidence facts into reaction fields.
- Do not treat workup reagents, extraction solvent, drying agents, or column
  media as reaction `reagents` or reaction `solvent`.
- Do not rely on network PubChem calls in the default import path.

## Current State

The current prose importer lowers SI text to `StepFrame[]` and
`ObservationFrame[]`, then renders only:

```chemd
:::procedure #import-procedure
step: add | ...
:::
```

The language and export layers already support reaction entities:

```chemd
:::chemd #rxn1
kind: reaction
reactant: @starting-material | amount=0.322 mmol | limiting=true
reagents: sBuLi | TMEDA
solvent: THF
temperature: -78 °C
time: 15 min
yield: 70%
:::
```

This task adds a reaction-candidate layer and a schema-driven renderer between
prose import and Chemd draft rendering.

## Architecture

```text
SI prose
  -> material mentions / quantities / step frames
  -> reaction fact candidates
  -> role classification
  -> schema-driven reaction block rendering
  -> procedure block linked by reaction: @rxn1
  -> compiler validation
```

### Core Types

```ts
type ReactionFactRole =
  | "reactant"
  | "product"
  | "reagent"
  | "solvent"
  | "temperature"
  | "time"
  | "pressure"
  | "atmosphere"
  | "yield";

interface ReactionFactCandidate {
  id: string;
  role: ReactionFactRole;
  raw: string;
  normalized?: string;
  confidence: number;
  sourceSpan: ProseSourceSpan;
  evidence: string[];
  warnings: string[];
}

interface ReactionCandidate {
  id: string;
  source: "prose_import";
  confidence: number;
  facts: ReactionFactCandidate[];
  rejectedFacts: ReactionFactCandidate[];
  diagnostics: ImportDiagnostic[];
}
```

### Write Policy

| Confidence | Behavior |
|---|---|
| `>= 0.90` | render field without warning |
| `0.75-0.90` | render field and emit warning |
| `0.45-0.75` | keep unresolved candidate, do not render field |
| `< 0.45` | keep prose/diagnostic only |

For field rendering, use the minimum confidence across mention detection,
normalization, role classification, and field compatibility.

## Phase 1: Candidate Contract and Golden Fixtures

### Tasks

- Add synthetic English SI fixtures under `packages/importer-prose/tests`.
- Capture cases:
  - one-pot addition and workup
  - extraction solvent not equal reaction solvent
  - drying agent excluded from reaction reagents
  - quench agent excluded from reaction reagents
  - temperature/time from reaction stage
- Add `ReactionCandidate` and `ReactionFactCandidate` types.
- Add a no-op reaction-candidate extractor returning an empty list.

### Done Criteria

- Existing importer behavior remains unchanged.
- Tests assert no reaction block is rendered until the feature is wired.
- Fixture expected outputs include diagnostics expectations.

### Verification

- `pnpm --filter @chemd/importer-prose test`
- `pnpm --filter @chemd/compiler test -- docs-marked-examples.test.ts`

### Trellis Closeout

- Self-review diff.
- Commit with task files and phase implementation.
- `add_session.py` with commit hash.
- Keep task active if later phases remain.

## Phase 2: Schema-Driven Reaction Renderer

### Tasks

- Implement `renderReactionBlock(candidate, options)`.
- Use `getBlockSchema("chemd")`, `getBlockFieldListMode`, and
  `getQuantityFieldClass` instead of hardcoded Chemd field rules.
- Render `reactant` and `product` using the language layer list mode.
- Render scalar condition fields only if schema accepts the field.
- Ensure `renderChemdDraft()` can emit reaction block before procedure.
- Link procedure by `reaction: @rxn1`.

### Done Criteria

- Generated Chemd compiles.
- Unsupported fields are dropped with diagnostics, never silently.
- `procedure` output remains stable except for the reaction reference.

### Verification

- `pnpm --filter @chemd/importer-prose test`
- `pnpm --filter @chemd/compiler test`

## Phase 3: Conservative Reaction Aggregator

### Tasks

- Aggregate high-confidence facts from existing `StepFrame[]`,
  `MaterialMention[]`, and `QuantityMention[]`.
- Role rules:
  - reaction/setup `charge` and early `add` can produce reactant/reagent
    candidates
  - `extract`, `wash`, `dry`, `filter`, `concentrate`, `purify` are workup or
    purification and cannot produce reaction reagents
  - `cool`, `heat`, `hold` can produce reaction temperature/time candidates
  - outcome/product facts require explicit afford/yield evidence
- Emit diagnostics for rejected or ambiguous facts.

### Done Criteria

- Workup facts are excluded from reaction fields with warnings.
- At least one valid reaction block is generated for a representative SI
  procedure.
- Low-confidence facts remain visible in diagnostics.

### Verification

- `pnpm --filter @chemd/importer-prose test`
- `pnpm --filter @chemd/step-ontology test`
- manual CLI smoke: `chemd import prose <fixture> --dry-run`

## Phase 4: Export and Docs Verification

### Tasks

- Add semantic/training export smoke tests showing generated reaction fields
  enter `semantic_layer.reactions` and training field evidence.
- Update docs under `apps/docs/content/docs/en` and `zh`:
  - prose import now emits reaction + procedure
  - confidence and warning policy
  - reaction summary versus procedure details
- Add examples with workup exclusion.

### Done Criteria

- Docs and tests agree with current compiler output.
- Export layer consumes generated reaction blocks without importer-specific
  logic.

### Verification

- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs build`
- `pnpm --filter @chemd/docs typecheck`

## Review Requirements

- A subagent may implement isolated files under `packages/importer-prose`.
- The architect reviews every change before commit.
- No worker may modify `packages/core/src/schema`, parser grammar, or type
  contracts without explicit approval.
- Every rendered reaction field must have source evidence and confidence.
