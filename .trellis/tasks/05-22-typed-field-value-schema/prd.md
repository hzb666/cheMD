# Chemd Typed Field Value Schema Unification

## Goal

Unify Chemd block field value definitions so parser, typechecker,
language-service, exporters, and docs can read one source of truth for field
value shape, while preserving all existing language behavior.

This task is not a grammar redesign. It introduces typed metadata and drift
guards first, then migrates consumers in small, behavior-preserving phases.

## Non-Goals

- Do not change author-facing `key: value` syntax.
- Do not change parser AST output in the first phases.
- Do not change existing diagnostics, severity, or compile pipeline order.
- Do not remove legacy fields such as `values`, `list`, `listMode`, or aliases.
- Do not make Chemd compile perform runtime side effects.
- Do not deep-normalize TLC/NMR/event records before the shared schema contract
  and baseline tests prove the current output is stable.

## Current Facts

- `packages/core/src/schema/block-schema.ts` owns block field names, aliases,
  list modes, and a small `values` map, but not value types.
- `packages/parser/src/body/parse-body-shared.ts` parses fields into
  `Record<string, string | string[]>`; most values remain raw strings.
- `packages/typechecker/src/nodes.ts` manually maps selected fields to
  quantity, reference, enum, and domain-normalized typed values.
- `packages/step-ontology/src/step-schema-types.ts` already has a better
  parameter model: `string`, `quantity`, `reference`, `enum`, and `boolean`.
- `packages/language-service/src/completion-values.ts` has an independent
  value registry, and semantic-token value highlighting still includes regex
  fallback logic.
- `packages/compiler/tests/docs-coverage.test.ts` is the current docs drift
  guard and must be kept in sync.

## Architecture

Chemd should model block fields as typed named parameters:

```text
Block constructor -> field parameter -> typed value literal/reference/record
```

Examples:

```chemd
temperature: 10 °C
result: @res-main
reactant: @mat-a | amount=2.0 mmol | equiv=1.0 | limiting=true
condition: temperature=10 °C | time=2 h | atmosphere=N2
```

Equivalent compiler model:

```ts
reaction({
  temperature: Quantity<"temperature">("10 °C"),
  result: Ref<"result">("res-main"),
  reactant: Participant({
    head: Ref<"material">("mat-a"),
    amount: Quantity<"amount">("2.0 mmol"),
    equivalent: Quantity<"equivalent">("1.0"),
    limiting: Boolean(true)
  })
});
```

The schema is metadata first. Later phases may consume it through adapters, but
every replacement must prove output equivalence.

## Proposed Value Type Contract

Add a discriminated union in `@chemd/core`:

```ts
export type FieldValueSchema =
  | { kind: "string" }
  | { kind: "text" }
  | { kind: "identifier" }
  | { kind: "boolean" }
  | { kind: "integer" }
  | { kind: "float" }
  | { kind: "date" }
  | { kind: "path" }
  | { kind: "url" }
  | { kind: "enum"; values: readonly string[]; aliases?: Readonly<Record<string, string>> }
  | { kind: "quantity"; quantityClass: QuantityClass }
  | { kind: "percent" }
  | { kind: "reference"; targetKind: ObjectSemanticKind | readonly ObjectSemanticKind[] }
  | { kind: "ref_or_literal"; targetKind: ObjectSemanticKind | readonly ObjectSemanticKind[] }
  | { kind: "list"; item: FieldValueSchema; mode: "pipe" | "repeat" }
  | { kind: "record"; head?: FieldValueSchema; params: Readonly<Record<string, FieldValueSchema>> }
  | { kind: "chemical"; chemicalKind: "smiles" | "rxn_smiles" | "inchi" | "inchikey" | "cas" | "formula" }
  | { kind: "domain"; domainKind: string };
```

`percent` is a first-class shorthand for `quantity<percent>` with range
validation already implemented by the typechecker.

## Phase Plan

### Phase 0 - Baseline And Drift Inventory

Purpose: prove the current behavior before adding schema metadata.

Scope:

- Add or extend tests that snapshot current field lists and value behavior.
- Inventory independent field/value registries and legacy exceptions.
- No production code behavior changes.

Expected files:

- `packages/core/tests/core.test.ts`
- `packages/parser/tests/parser.test.ts`
- `packages/typechecker/tests/typechecker.test.ts`
- `packages/language-service/tests/completion.test.ts`
- `packages/compiler/tests/docs-coverage.test.ts`
- `apps/docs/content/docs/en/codebase/parser.mdx`
- `apps/docs/content/docs/zh/codebase/parser.mdx`

Checks:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`
- `git diff --check`

Completion gate:

- Self-review code diff.
- Confirm no compile output, parser AST, or diagnostic behavior changed.
- Commit as a focused Phase 0 commit.
- Record Trellis session if stopping after this phase.

### Phase 1 - Core Field Value Schema Metadata

Purpose: add the shared type declarations and annotate existing block fields
without changing consumers.

Scope:

- Extend `BlockFieldSchema` with optional `value?: FieldValueSchema`.
- Preserve `values`, `list`, `listMode`, aliases, and completion behavior.
- Add query helpers:
  - `getBlockFieldSchema(blockType, fieldName)`
  - `getFieldValueSchema(blockType, fieldName)`
  - `getEnumFieldValues(blockType, fieldName)`
  - `getQuantityFieldClass(blockType, fieldName)`
  - `getReferenceTargetKinds(blockType, fieldName)`
- Add tests proving legacy helpers return the same values as before.

Expected files:

- `packages/core/src/schema/block-schema.ts`
- `packages/core/src/index.ts`
- `packages/core/tests/core.test.ts`
- docs codebase pages explaining metadata-only status.

Checks:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`

Completion gate:

- Code review against `@chemd/core` spec.
- Confirm public API remains additive.
- Commit Phase 1.

### Phase 2 - Schema Coverage And Legacy Exception Tests

Purpose: make drift visible before replacing any runtime logic.

Scope:

- Require all canonical block fields to have `value` metadata.
- Add a small centralized legacy exception list for domain fields that are
  intentionally coarse, such as TLC spot/peak/ion records.
- Add tests that fail if new fields omit value schema.
- Add tests proving `values` and `value.kind === "enum"` stay aligned.

Expected files:

- `packages/core/src/schema/block-schema.ts`
- `packages/core/tests/core.test.ts`
- `packages/compiler/tests/docs-coverage.test.ts`
- `apps/docs/content/docs/en/language-fundamentals/blocks.mdx`
- `apps/docs/content/docs/zh/language-fundamentals/blocks.mdx`

Checks:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/core typecheck`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`
- `pnpm --filter @chemd/docs typecheck`

Completion gate:

- Review every exception and ensure it is documented.
- Commit Phase 2.

### Phase 3 - IDE Consumers Read Schema Without Behavior Drift

Purpose: remove IDE-specific field/value drift while keeping visible behavior.

Scope:

- Replace `completion-values.ts` registry with schema-derived enum values.
- Add value type detail in completion/hover where non-invasive.
- Keep regex semantic token fallback; add schema-driven tests before changing
  token logic.
- Do not change Monaco visual theme unless tests require token naming updates.

Expected files:

- `packages/language-service/src/completion-values.ts`
- `packages/language-service/src/completion-fields.ts`
- `packages/language-service/src/hover.ts`
- `packages/language-service/src/semantic-tokens.ts`
- `packages/language-service/tests/completion.test.ts`
- `packages/language-service/tests/language-service.test.ts`
- `apps/docs/content/docs/en/codebase/parser.mdx`
- `apps/docs/content/docs/zh/codebase/parser.mdx`

Checks:

- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/language-service typecheck`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts`

Completion gate:

- Review token and completion outputs for parity.
- Commit Phase 3.

### Phase 4 - Typechecker Adapter, Equivalence First

Purpose: introduce a shared normalization adapter that calls existing logic.

Scope:

- Add `normalizeFieldValue(raw, schema, context)` in `@chemd/typechecker`.
- Initially call existing `parseQuantity`, reference resolvers, enum
  normalizers, and boolean parsing.
- Replace only the lowest-risk manual mappings first:
  - enum values: result `status`, chemd `kind`, analysis `type`, atmosphere
  - quantities: result/sample/material/batch percent and mass fields
  - references: result reaction/product and artifact/sample references
- Each replacement needs equivalence tests against existing typed graph output.

Expected files:

- `packages/typechecker/src/field-values.ts`
- `packages/typechecker/src/nodes.ts`
- `packages/typechecker/src/normalize.ts`
- `packages/typechecker/tests/typechecker.test.ts`
- `packages/typechecker/tests/quantity-material-reaction-semantics.test.ts`

Checks:

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/typechecker typecheck`
- `pnpm --filter @chemd/compiler test -- v03-language.test.ts docs-coverage.test.ts`

Completion gate:

- Review output snapshots and diagnostics.
- Commit Phase 4.

### Phase 5 - Structured Records And Chemical Domain Types

Purpose: describe compound values without forcing surface syntax changes.

Scope:

- Model reaction participant values as `record` with `head` and typed params.
- Model condition rows as `domain` or `record` according to current behavior.
- Keep TLC/NMR/MS values coarse unless existing normalizers already expose a
  stable typed result.
- Do not split NMR peaks into graph-level first-class nodes in this task.

Expected files:

- `packages/core/src/schema/block-schema.ts`
- `packages/typechecker/src/nodes.ts`
- `packages/typechecker/tests/condition-analysis-schemas.test.ts`
- `packages/parser/tests/parser.test.ts`
- syntax-block docs for chemd, analysis, condition-varies.

Checks:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`

Completion gate:

- Review ambiguity handling and examples.
- Commit Phase 5.

### Phase 6 - Docs And Export Contract Alignment

Purpose: make docs/export descriptions consume or test against schema facts.

Scope:

- Document value types, required/default fields, examples, and no-side-effect
  compiler model.
- Expand docs coverage tests so manual field tables cannot drift from schema.
- Confirm JSON, HTML, DOCX, LNF, semantic, RAG, and training export docs still
  describe current outputs.
- Do not change exporter payloads unless Phase 4 already proved equivalence.

Expected files:

- `apps/docs/content/docs/en/language-fundamentals/blocks.mdx`
- `apps/docs/content/docs/zh/language-fundamentals/blocks.mdx`
- `apps/docs/content/docs/en/codebase/parser.mdx`
- `apps/docs/content/docs/zh/codebase/parser.mdx`
- `apps/docs/content/docs/en/appendix/syntax-summary.mdx`
- `apps/docs/content/docs/zh/appendix/syntax-summary.mdx`
- `packages/compiler/tests/docs-coverage.test.ts`

Checks:

- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs typecheck`
- `pnpm --filter @chemd/docs build`

Completion gate:

- Review EN/ZH parity.
- Commit Phase 6.

### Phase 7 - Full Regression And Trellis Closeout

Purpose: prove the whole language contract did not drift.

Checks:

- `pnpm --filter @chemd/core test`
- `pnpm --filter @chemd/parser test`
- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/language-service test`
- `pnpm --filter @chemd/compiler test`
- `pnpm --filter @chemd/docs typecheck`
- `pnpm --filter @chemd/docs build`
- `git diff --check`

Completion gate:

- Final self-review.
- Commit any final docs/spec changes.
- Run Trellis finish flow:
  - task finish/archive when the task is fully done
  - `add_session.py` with the final commit hash

## Risk Controls

- Every phase must be independently testable and commit-sized.
- Prefer additive schema metadata before replacing logic.
- Any behavior-changing diagnostic or AST change requires a separate decision.
- Keep `compileChemd` pure; side-effecting export/runtime work stays outside
  language-core compilation.
- Keep legacy exception lists short and documented.
- If a phase reveals behavior drift, stop and add a regression test before
  continuing.

## Review Checklist Per Phase

- Does this phase preserve existing parser AST and compile output?
- Are all touched public APIs additive or equivalence-proven?
- Do tests cover both old behavior and new schema metadata?
- Did docs change only to describe current implementation?
- Did language-service consume core schema instead of creating a new registry?
- Did `git diff --check` pass?

## Initial Validation Commands

Run before first implementation commit:

```bash
pnpm --filter @chemd/core test
pnpm --filter @chemd/parser test
pnpm --filter @chemd/typechecker test
pnpm --filter @chemd/language-service test
pnpm --filter @chemd/compiler test -- docs-coverage.test.ts
git diff --check
```
