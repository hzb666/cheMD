# Chemd Language v0.3 Pipeline Contracts

Status: Filled from commit `97d3151`; v0.4 surface semantics below supersede legacy v0.3 signatures where noted.

## Scenario: v0.3 Semantic Language Pipeline

### 1. Scope / Trigger

- Trigger: `@chemd/compiler` now returns v0.3 semantic artifacts in addition to render outputs.
- Applies when editing `packages/compiler`, `packages/typechecker`, `packages/step-ontology`, `packages/runtime-lab`, `packages/runtime-trace`, `packages/lnf`, or training export fields.
- This is cross-layer: parser/resolver AST data flows into typed semantic graph, step graph, run plan, LNF, runtime preflight, and training export.

### 2. Signatures

```typescript
compileChemd(source: string, options?: CompileOptions): CompileResult
```

`CompileResult` must keep the legacy render fields and add the canonical semantic artifacts:

```typescript
{
  typedSemanticGraph: TypedSemanticGraph;
  stepGraph: StepGraph;
  runPlan: RunPlan;
  runtimePreflight: PreflightResult;
  lnf: ChemdLnf;
  trainingExport: ChemdTrainingExportV2;
}
```

Core builders:

```typescript
typecheckDocument(document: ChemdDocument, options?: TypecheckOptions): TypecheckResult
buildRunPlan(input: RunPlanInput): RunPlan
preflightRun(runPlan: RunPlan, options: PreflightOptions): PreflightResult
buildCanonicalLnf(input: BuildLnfInput): ChemdLnf
exportTrainingRecordFromDocument(
  document: ChemdDocument,
  options?: ExportTrainingRecordOptions
): ChemdTrainingExportV2
```

### 3. Contracts

Pipeline order is executable and must stay stable:

```text
parseChemd
  -> resolveChemd
  -> typecheckDocument
  -> resolveRenderProfileWithDiagnostics
  -> buildRunPlan
  -> preflightRun
  -> buildCanonicalLnf
  -> exportTrainingRecordFromDocument
  -> renderHtml/renderJson/renderDocxBridge
```

Required payload fields:

| Artifact | Required fields |
|----------|-----------------|
| `TypedSemanticGraph` | `documentId`, `nodes`, `quantities`, `diagnostics` |
| `StepGraph` | `steps`, `procedures`, `observations`, `diagnostics` |
| `RunPlan` | `planId`, `documentId`, `status`, `steps`, `diagnostics` |
| `PreflightResult` | `blocking`, `diagnostics` |
| `ChemdLnf` | `schemaVersion: "chemd-lnf/v0.5"`, `experiment.document`, `experiment.entities`, `experiment.semantic`, `experiment.workflow`, optional `experiment.runtime`, `experiment.quality` |
| `ChemdTrainingExportV2.semantic_layer` | Optional `lnf` when caller passes the canonical `ChemdLnf` |
| `ChemdTrainingExportV2.learning_layer` | `retrieval_chunks`, `prediction_instances`, plus optional `procedure_to_steps`, `observation_to_events` from `StepGraph` |

Diagnostics from `typecheckDocument` and render profile resolution must be merged into `CompileResult.document.diagnostics`; do not throw for semantic validation failures that have a diagnostic code.

### 4. Validation & Error Matrix

| Code | Owner | Condition | Expected behavior |
|------|-------|-----------|-------------------|
| `E306` | `@chemd/typechecker` | Result status is outside the known status set | Add warning; use `unknown` fallback |
| `E402` | `@chemd/typechecker` | Percent quantity is outside the expected 0-100 range | Add warning and preserve normalized/raw quantity |
| `E403` | `@chemd/typechecker` | Quantity text cannot normalize to numeric/unit form | Add warning and preserve raw source |
| `E_TYPED_REFERENCE_MISMATCH` | `@chemd/typechecker` | Typed reference cannot resolve to the expected target kind | Add error; continue graph build |
| `E_DERIVED_EXPRESSION_INVALID` | `@chemd/typechecker` | `field: =...` derived expression fails static evaluation | Add error and preserve the original raw quantity where applicable |
| `E_RESULT_REACTION_CONFLICT` | `@chemd/typechecker` | Result `reaction` and `product` fields disagree with the reaction product set | Add warning; keep both references for review |
| `W805` | `@chemd/step-ontology` | Procedure or observation prose cannot lower confidently | Add warning; keep remaining structured steps/events |
| `E605` | `@chemd/runtime-lab` | Runtime step requires unavailable capability/equipment | `preflightRun(...).blocking === true`; do not mutate run plan |
| Runtime state events | `@chemd/runtime-lab` / `@chemd/runtime-trace` | `operator_action`, `confirmation_granted`, `artifact_generated`, `observation_recorded`, `diagnostic_recorded` | Runtime-lab records them; runtime-trace adapts them into replayable trace events |

### 5. Good/Base/Bad Cases

Good:

- A procedure containing charge, purge, heat/cool, sample, analyze, quench, workup, filter, or isolate text lowers to canonical `CanonicalStepNode` entries.
- `compileChemd(source).lnf.schemaVersion` is exactly `"chemd-lnf/v0.5"`.
- `trainingExport.schema_version` is exactly `"chemd-training-export/v0.2"`.
- `trainingExport.semantic_layer.lnf` matches the LNF returned by `compileChemd`.

Base:

- A document with no procedure sections returns empty `stepGraph.steps`, a valid `RunPlan`, and no thrown exception.
- Existing `html`, `json`, and `docxBridge` outputs still render from `document`.

Bad:

- Unknown step prose must emit `W805` instead of inventing a precise action.
- Missing runtime capabilities must emit `E605` in preflight instead of deleting the affected step.
- Invalid quantities must keep raw text and emit diagnostics instead of coercing to zero.
- Derived field expressions use `field: =...` author syntax, may read references such as `@node.field`, and must fail closed with `E_DERIVED_EXPRESSION_INVALID`.

### 6. Tests Required

Required assertion points:

- `packages/compiler/tests/v03-language.test.ts`: `compileChemd` returns all v0.3 artifacts and merges diagnostics.
- `packages/step-ontology/tests/lowering.test.ts`: procedure/observation/analysis lowering emits canonical nodes and warnings.
- `packages/typechecker/tests/typechecker.test.ts`: typed graph nodes, quantity normalization, and diagnostics are stable.
- `packages/runtime-lab/tests/runtime-lab.test.ts`: run plan and preflight contract, including `E605`.
- `packages/runtime-trace/tests/runtime-trace.test.ts`: trace replay order, state transitions, and runtime-lab trace adaptation.
- `packages/lnf/tests/lnf.test.ts`: LNF schema version and semantic payload fields.
- `packages/exporter-training/tests/exporter-record.test.ts`: canonical `lnf` and learning pairs are exported when passed.

Run before claiming complete:

```bash
pnpm typecheck
pnpm test
pnpm exec eslint packages/diagnostics packages/step-ontology packages/typechecker packages/runtime-lab packages/runtime-trace packages/lnf packages/compiler/src/index.ts packages/exporter-training/src/export-record.ts packages/exporter-training/src/learning-layer.ts packages/exporter-training/src/types.ts packages/core/src/reaction-conditions.ts --ext .ts
```

### 7. Wrong vs Correct

#### Wrong

```typescript
const document = resolveChemd(parseChemd(source));
const lnf = buildCanonicalLnf({ document, typedGraph: {} as never, stepGraph: {} as never, diagnostics: [] });
```

This bypasses the typed graph and step graph contracts, so LNF becomes structurally valid but semantically empty.

#### Correct

```typescript
const document = resolveChemd(parseChemd(source));
const typecheckResult = typecheckDocument(document);
const runPlan = buildRunPlan({
  documentId: document.meta.id,
  typedGraph: typecheckResult.typedGraph,
  stepGraph: typecheckResult.stepGraph
});
const runtimePreflight = preflightRun(runPlan, {
  capabilities: DEFAULT_RUNTIME_CAPABILITIES
});
const lnf = buildCanonicalLnf({
  document,
  typedGraph: typecheckResult.typedGraph,
  stepGraph: typecheckResult.stepGraph,
  diagnostics: document.diagnostics,
  runPlan,
  runtimePreflight
});
```

Use the compiler pipeline for consumers. Only call the builders directly in focused package tests or when implementing a new pipeline stage.

## Scenario: Canonical Surface and v0.4 Semantic Bus

### 1. Scope / Trigger

- Trigger: `:::chemd` is the only parser-supported molecule/reaction authoring block, with explicit `kind:` and separate legacy migration tooling.
- Applies when changing parser, diagnostics, resolver/typechecker, renderers, runtime, training export, web DTOs, or `services/chem-service` DTOs.
- This is cross-layer because `syntaxOrigin`, `declaredKind`, explicit steps, normalized typed fields, and service provenance must survive parser -> compiler -> renderer/export/runtime/web boundaries.

### 2. Signatures

```typescript
parseChemd(source: string, options?: {
  strictChemdKind?: boolean;
}): ChemdDocument

typecheckDocument(document: ChemdDocument, options?: {
  procedureMode?: "auto" | "explicit" | "lowered";
}): TypecheckResult

compileChemd(source: string, options?: CompileOptions): CompileResult
renderJson(document: ChemdDocument, options?: {
  typedGraph?: { nodes: Array<{ kind: string; nodeId: string }> };
}): string
```

`CompileResult` must include the unique canonical LNF output:

```typescript
{
  lnf: ChemdLnf;
}
```

### 3. Contracts

Canonical surface contract:

| Surface block | Required behavior |
|---------------|-------------------|
| `:::chemd kind: molecule` | Emit semantic `MoleculeNode` with `syntaxOrigin: "chemd"` and `declaredKind: "molecule"` |
| `:::chemd kind: reaction` | Emit semantic `ReactionNode` with `syntaxOrigin: "chemd"` and `declaredKind: "reaction"` |
| `:::chemd` without `kind` | Keep shape inference for compatibility; strict mode emits `W_CHEMD_KIND_AMBIGUOUS` |
| `:::chemd kind: invalid` or empty `kind:` | Emit `E_CHEMD_KIND_CONFLICT`; do not create a semantic molecule/reaction node by shape fallback |
| `:::molecule` / `:::reaction` | Do not parse as semantic nodes; migration/audit scripts identify and convert them before compile |

Molecule identity contract:

| Source field | Target field | Required behavior |
|--------------|--------------|-------------------|
| `smiles` | `MoleculeNode.smiles` | Preserve as structural string and expose through typechecker/exporters |
| `cas` | `MoleculeNode.cas` | Preserve separately from `smiles`; never use as `smiles` fallback |

Diagnostic extension contract:

| Field | Owner | Required behavior |
|-------|-------|-------------------|
| `sourceLayer` | parser/diagnostics/compiler | Name the layer that emitted or enriched the diagnostic |
| `sourceNodeType` / `sourceNodeId` / `sourceField` | parser/typechecker/renderers | Point to the structured node/field when available |
| `facts` | parser/diagnostics/LNF/export | Store machine-readable migration facts such as `legacy_block_kind` |
| `quickFixes` | diagnostics/compiler | Use public `DiagnosticQuickFix` fields: `title`, `kind`, optional `patch` |

Procedure contract:

| Mode | Behavior |
|------|----------|
| `auto` | Use explicit `ProcedureNode.steps` when present; otherwise lower prose |
| `explicit` | Require explicit `step:` entries; prose-only procedures emit `E_STEP_MISSING_FIELD` |
| `lowered` | Ignore explicit step entries and lower `ProcedureNode.body` prose |

Normalization contract:

- Reaction conditions and TLC facts are produced by `@chemd/typechecker`, not by renderers.
- `renderJson` may serialize `normalized_conditions` / `normalized_tlc` only from a caller-provided typed graph.
- `renderJson` flattens `col.children` for compatibility and must mark `document.layout.col_strategy` as `"flatten_children"` when a `col` node was flattened.
- `renderDocxBridge` must recursively render `col.children`; it must not return an empty bridge for a populated column node.
- LNF and training export must consume `typedGraph` fields instead of reclassifying raw renderer nodes.
- Training export semantic layer must preserve molecule `cas`, normalized molecule quantities, result/sample percent fields, result status labels, `normalized_outcome_hints`, and optional canonical `lnf`.
- Training export learning layer must create retrieval chunks from available source text/reactions/results and prediction instances for reactions with linked features/targets.

Runtime/service contract:

| Artifact | Required fields |
|----------|-----------------|
| `RuntimeStep` | `source`, `sourceType`, `confirmationStrategy`, `dependsOn`, `outputs`, `artifacts` |
| Trace replay | `unknownStepIds`, `orderViolations`, `artifactIds`, `manualOverrideCount` |
| Chem-service DTO | `kind`, `provider`, `candidates`, `placeholder`, `normalized`, plus existing compatibility fields |
| Structure cache | `provider`, `fingerprint`, `normalized` metadata when supplied |

### 4. Validation & Error Matrix

| Code / State | Owner | Condition | Expected behavior |
|--------------|-------|-----------|-------------------|
| `W_UNKNOWN_BLOCK` | parser | Legacy `:::molecule` / `:::reaction` reaches parser | Warn as unsupported block; do not create semantic node |
| `W_CHEMD_KIND_AMBIGUOUS` | parser | `strictChemdKind` sees `:::chemd` without `kind:` | Keep parsing, emit warning |
| `E_CHEMD_KIND_CONFLICT` | parser | Explicit `kind:` is unsupported, empty, or conflicts with reaction/molecule fields | Emit error diagnostic; do not create a shape-inferred semantic node |
| `convert_legacy_block` quick fix | diagnostics/compiler | Legacy `:::molecule` / `:::reaction` warning is enriched | Provide a deterministic migration suggestion instead of a local ad hoc type |
| `E_STEP_MISSING_FIELD` | typechecker | `procedureMode: "explicit"` without explicit steps | Emit diagnostic and no lowered steps |
| `review_inferred` | runtime-lab | Lowered or low-confidence step | Require human review without dropping step |
| `placeholder: true` | chem-service | Provider unavailable fallback OCR response | Return failed placeholder DTO; Web must not persist it as successful chemistry |

### 5. Good/Base/Bad Cases

Good:

- New web/OCR/reaction-editor writeback emits `:::chemd` with `kind: molecule` or `kind: reaction`.
- A molecule with both `smiles` and `cas` keeps both fields independently through parser, typechecker, HTML/JSON/DOCX renderers, and training export.
- Explicit procedure steps carry `sourceType: "explicit_step"` to typed graph, runtime plan, LNF, and training export.
- Chem-service OCR/render/normalize responses keep old fields and add the canonical DTO metadata.

Base:

- Existing prose-only procedures still lower in `auto` mode.
- JSON/HTML/DOCX renderers remain display layers and can show origin/step metadata without inferring chemistry.
- `ChemdLnf` is the only LNF output and uses `schemaVersion: "chemd-lnf/v0.5"`.
- JSON output may flatten layout `col` nodes only when it records the flattening strategy.

Bad:

- Do not add `classifyReactionConditions` or `classifyTlcAnalysis` calls back into renderer packages.
- Do not let Web invent a successful molecule/reaction from `placeholder: true`.
- Do not treat internal semantic kind (`molecule` / `reaction`) as the surface block name.
- Do not put a CAS number into `MoleculeNode.smiles` or any typed/exported `smiles` field.
- Do not infer a semantic node from fields after an explicit invalid `kind:`.

### 6. Tests Required

Required assertion points:

- Parser tests for canonical `kind`, unsupported legacy blocks with `convert_legacy_block`, strict missing-kind behavior, invalid/empty kind fail-closed behavior, CAS preservation, and explicit procedure steps.
- Typechecker tests for `procedureMode`, explicit/lowered `sourceType`, typed normalization, and molecule `cas`.
- Renderer JSON tests proving normalized fields come only from typed graph and `col` flattening records `document.layout.col_strategy`.
- Renderer HTML/DOCX tests proving molecule CAS/SMILES display and DOCX recursive `col.children` rendering.
- LNF tests for `chemd-lnf/v0.5` canonical entities, workflow, runtime, step source, and migration summary.
- Exporter/compiler tests proving `semantic_layer.lnf`, normalized values, retrieval chunks, and reaction prediction instances are populated.
- Runtime lab/trace tests for source provenance, inferred confirmation, artifact IDs, unknown steps, and order violations.
- Web tests for strict JSON export diagnostics, explicit-kind target selection, structure cache metadata, timeout/error handling, request size/content-type limits, and SVG hydration rejection.
- Chem-service tests for DTO metadata, placeholder behavior, and empty-side reaction acceptance.

### 7. Wrong vs Correct

#### Wrong

```typescript
const json = renderJson(document);
// Then infer normalized_conditions inside renderer-json from raw reaction fields.
```

#### Correct

```typescript
const checked = typecheckDocument(document);
const json = renderJson(document, { typedGraph: checked.typedGraph });
```

Renderers serialize typed truth. They do not become another semantic classifier.
