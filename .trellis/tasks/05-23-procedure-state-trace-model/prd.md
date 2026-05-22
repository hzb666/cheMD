# Procedure State Trace Model

## Goal

Add a derived experiment process state model from existing Chemd procedure
steps. This task does not change Chemd surface syntax. It interprets existing
ordered `step:` lines as state transitions over a default vessel, streams,
phases, and material flow.

The state trace is a language-service/typechecker/export semantic product, not
a new authoring syntax.

## Non-Goals

- Do not change parser grammar.
- Do not require users to write before/after state.
- Do not make importer-specific rules the source of truth.
- Do not replace explicit `inputs`, `outputs`, or `depends_on`; derive from
  them when present.
- Do not make uncertain inferred state an error unless current Chemd rules
  already require it.

## Current State

Chemd currently represents operation order as a procedure step list:

```chemd
:::procedure #p1
step: charge | id=s1 | materials=6 | solvent=THF
step: add | id=s2 | materials=TMEDA
step: cool | id=s3 | temperature=-78 °C
step: quench | id=s4 | materials=H2O
:::
```

This preserves order but does not expose a first-class derived trace such as:

```text
s1 after: vessel:main contains [6, THF]
s2 after: vessel:main contains [6, THF, TMEDA]
s3 after: vessel:main temperature = -78 °C
s4 after: stage = workup, vessel:main contains [6, THF, TMEDA, H2O]
```

## Architecture

```text
typed procedure steps
  -> step effect table
  -> ordered state trace builder
  -> semantic diagnostics
  -> exporter/training/IDE consumers
```

## Phase 1: State Trace Contract

### Tasks

- Add internal types:
  - `ProcedureStateTrace`
  - `ProcedureStateFrame`
  - `ProcedureStateSnapshot`
  - `ProcedureVesselState`
  - `ProcedureStreamState`
  - `StepEffect`
  - `ProcedureStateDiagnostic`
- Expose the trace from typechecker or a narrowly scoped shared package.
- Return an empty/basic trace for procedures without steps.

### Done Criteria

- No existing compile/render output changes.
- Type definitions are documented by tests.
- Unknown procedure structures are tolerated with warnings.

### Verification

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/compiler test`

## Phase 2: Step Effect Table

### Tasks

Define semantic effects for existing step families:

| Family | Derived Effect |
|---|---|
| `charge` | add initial materials/solvent to target vessel |
| `add` | add materials/inputs to target vessel |
| `transfer` | move material between vessels/streams when target exists |
| `mix` | mark vessel mixed |
| `cool` | set temperature state |
| `heat` | set temperature state |
| `hold` | preserve state and add duration condition |
| `purge` | set atmosphere |
| `quench` | add quench agent and enter workup candidate state |
| `extract` | create phase/stream candidates |
| `wash` | wash current vessel/stream |
| `separate_layers` | split organic/aqueous phase candidates |
| `filter` | create filtrate/cake candidates |
| `dry` | apply drying agent to current stream |
| `concentrate` | remove solvent and create residue candidate |
| `purify` | consume crude/residue and produce purified output candidate |
| `sample` | create sample relation |
| `analyze` | create evidence relation, no material change |
| `observe` | observation only, no material change |
| `store` | assign storage location |

### Done Criteria

- Every known `STEP_FAMILY_SCHEMAS` family has an effect definition.
- Unknown families produce `unknown_step_effect` warning.
- Effect table uses step schema metadata where possible.

### Verification

- `pnpm --filter @chemd/step-ontology test`
- `pnpm --filter @chemd/typechecker test`

## Phase 3: Main Vessel Trace Builder

### Tasks

- Initialize `vessel:main` empty for each procedure.
- Walk steps in source order.
- Apply effect table to produce before/effects/after frames.
- Respect explicit `inputs`, `outputs`, `depends_on`, `stage`, and `vessel`
  params when present.
- Default target to `vessel:main` with a warning if ambiguous.

### Done Criteria

- `charge -> add -> cool -> hold` produces stable before/after snapshots.
- Frame order is deterministic.
- Snapshots contain source step ids and confidence.

### Verification

- `pnpm --filter @chemd/typechecker test -- procedure-state-trace.test.ts`
- `pnpm --filter @chemd/compiler test`

## Phase 4: Workup, Stream, and Phase Semantics

### Tasks

- Model common workup transitions:
  - quench
  - extract
  - wash
  - separate layers
  - dry
  - filter
  - concentrate
  - purify
- Represent `organic phase`, `aqueous phase`, `filtrate`, `cake`, `residue`,
  and `purified product` as derived stream states.
- Keep uncertain phase assignment as warning, not error.

### Done Criteria

- Workup materials do not become reaction reagents in derived summaries.
- Stream lineage is visible in the trace.
- Warnings explain missing or ambiguous phase context.

### Verification

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/exporter-training test`

## Phase 5: Semantic Diagnostics

### Tasks

Emit warnings for:

- `add` without materials or inputs
- `extract` without plausible biphasic context
- `dry` without current organic stream
- `filter` with ambiguous target stream
- `quench` before a reaction-like stage
- reaction summary fields that conflict with procedure state
- workup material likely written as reaction reagent

### Done Criteria

- Diagnostics include source step id and field when possible.
- Warnings are visible through compiler/typechecker output.
- Existing valid documents do not start failing as errors.

### Verification

- `pnpm --filter @chemd/typechecker test`
- `pnpm --filter @chemd/compiler test`

## Phase 6: Export, Import, and IDE Consumers

### Tasks

- Export state trace or derived material-flow evidence in semantic/training
  output.
- Let importer reaction block generation prefer state-trace facts when
  available.
- Add optional JSON renderer output for procedure state trace.
- Add docs for process state semantics.
- IDE integration can remain limited to diagnostics/hover-ready data; no UI
  redesign is required in this task.

### Done Criteria

- Exporter does not maintain a separate procedure-state inference copy.
- Importer uses the same trace-derived roles where available.
- Docs explain ordered steps as state transitions.

### Verification

- `pnpm --filter @chemd/renderer-json test`
- `pnpm --filter @chemd/exporter-training test`
- `pnpm --filter @chemd/compiler test -- docs-coverage.test.ts docs-marked-examples.test.ts`
- `pnpm --filter @chemd/docs build`
- `pnpm --filter @chemd/docs typecheck`

## Review Requirements

- State trace work is shared semantic infrastructure; keep write ownership
  serialized around type contracts.
- Do not edit parser/core schema unless a separate approved language-layer task
  is created.
- Every effect must include tests for before/after and diagnostics.
