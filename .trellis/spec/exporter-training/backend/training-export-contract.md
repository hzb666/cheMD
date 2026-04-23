# Training Export Contract - @chemd/exporter-training

## Scenario: Semantic Fact Graph and Retrieval Chunks

### 1. Scope / Trigger

- Trigger: changing `ChemdTrainingExportV2.semantic_layer.links` or `learning_layer.retrieval_chunks`.
- Scope: pure transforms inside `packages/exporter-training/src`; do not re-parse source or duplicate typechecker logic.
- Consumers: compiler export, CLI `export --format training`, local LLM/RAG tooling, and prediction dataset builders.

### 2. Signatures

```ts
export function exportTrainingRecordFromDocument(
  document: ChemdDocument,
  options?: ExportTrainingRecordOptions
): ChemdTrainingExportV2;
```

Primary internal transforms:

```ts
buildSemanticLayer(document, { typedGraph }): SemanticLayerV1
buildLearningLayer({ document, semanticLayer, stepGraph }): LearningLayerV1
```

### 3. Contracts

- `semantic_layer.links` must use stable exported `entity_id` values, not raw author ids.
- Reaction participants with resolved molecule refs produce:
  - `reaction_uses_molecule`
  - `reaction_produces_molecule`
- `result.ref` / `result.reaction` targeting a reaction produces `result_describes_reaction`.
- `analysis.ref` targeting a reaction/result/sample produces the matching `analysis_targets_*` relation.
- `sample.ref` targeting a reaction/result/molecule/sample produces the matching `sample_*` relation.
- `sample.derived_from`, `sample.aliquot_of`, `sample.batch_of`, and
  `sample.artifacts` must export explicit lineage/evidence relations when the
  target resolves:
  - `sample_derived_from_reaction`
  - `sample_derived_from_sample`
  - `sample_aliquot_of_sample`
  - `sample_batch_of_sample`
  - `sample_has_artifact`
- `sample.aliquot_of` and `sample.batch_of` must only emit relations when the
  target is a sample. `sample.artifacts` must only emit relations when the
  target is an artifact.
- Resolved structured references must match the exact semantic relation target
  and role for their source field. A relation from another field on the same
  source entity must not be reused just because it has the same target.
- `artifact.ref` targeting a reaction/result/analysis/sample produces the
  matching `artifact_supports_*` relation.
- `condition-varies` blocks are authored as:

  ```chemd
  :::condition-varies #cv-solvent-screen
  reaction: rxn-variant
  standard: rxn-standard
  solvent: THF -> MeCN
  temperature: 25 C -> 40 C
  notes: Optional rationale or observation.
  :::
  ```

  Parallel optimization attempts are authored as:

  ```chemd
  :::condition-varies #cv-screen
  standard: rxn-standard
  condition: solvent=THF | temperature=25 C | catalyst=Pd
  varies: solvent | temperature
  var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
  res1: res-var1
  note1: Higher yield but impurity visible.
  var2: reaction=rxn-var2 | mode=override | solvent=DMSO | temperature=60 C | catalyst=Ni
  res2: res-var2
  note2: Low conversion by TLC.
  :::
  ```

  `condition` declares the baseline condition variables. Each `varN`
  represents one parallel reaction attempt. `resN` and `noteN` bind by the
  same numeric suffix, so `var1` matches `res1` and `note1`. Attempt fields are
  partial overrides by default; `mode=override` means the attempt condition is a
  full replacement of the baseline condition.
- Parser output uses `ConditionVariesNode.type = "condition_varies"` with:
  - `reaction?: string` for the candidate/current reaction raw reference
  - `standard?: string` for the baseline reaction raw reference
  - `condition?: { field; raw; baseline? }[]`
  - `varyFields?: string[]`
  - `changes: { field; raw; baseline?; candidate? }[]`
  - `attempts?: { id; raw; mode?; reaction?; result?; note?; changes; condition }[]`
  - `notes?: string`
- `condition-varies.reaction`, `condition-varies.standard`, and
  `attempt.reaction` must typecheck as reaction references. `attempt.result`
  must typecheck as a result reference. Invalid or unresolved targets produce
  normal typed reference diagnostics; they must not invent relation targets.
- `@cv-id.var1` and structured `ref: @cv-id.var1` target the attempt entity
  `condition_variation_attempt`, so TLC/analysis/observation facts can attach
  to the exact optimization row.
- Exported condition variation entities must use `cv::<document_id>::<id>` and
  appear in `semantic_layer.condition_variations` as
  `ExportedConditionVaryV1` with `reaction_ref_raw`, `standard_ref_raw`,
  `condition`, `vary_fields`, `changes`, `attempt_entity_ids`, `notes`, and
  `text_for_embedding`.
- Exported condition variation attempt entities must use
  `cva::<document_id>::<condition_id>.<attempt_id>` and appear in
  `semantic_layer.condition_variation_attempts` with parent id, attempt id,
  reaction/result refs, effective condition, changed variables, note, and
  embedding text.
- Resolved condition variation references produce:
  - `condition_variation_targets_reaction` from the condition variation entity
    to the candidate reaction with role `reaction`
  - `condition_variation_compares_standard` from the condition variation entity
    to the standard reaction with role `standard`
  - `condition_variation_has_attempt` from the parent variation to each attempt
  - `condition_variation_attempt_targets_reaction` from each attempt to its
    reaction
  - `condition_variation_attempt_compares_standard` from each attempt to the
    inherited standard reaction
  - `condition_variation_attempt_has_result` from each attempt to its matched
    result
  - `analysis_targets_condition_variation_attempt` when TLC/analysis `ref`
    points to `@cv.varN`
- Resolved Markdown references produce `markdown_mentions_entity`.
- `learning_layer.retrieval_chunks` must include available:
  - `document_summary`
  - `markdown`
  - `reaction_summary`
  - `result_notes`
  - `analysis_notes`
  - `sample_notes`
  - `artifact_notes`
  - `condition_variation`
  - `condition_variation_attempt`
- The full `ChemdTrainingExportV2` is an audit export. Do not feed it directly
  to RAG or LoRA/SFT training jobs.
- RAG and model-training views must be projections from the full export:
  - `ChemdRagExportV1` keeps retrieval chunks and retrieval quality only.
  - `ChemdTrainingUnderstandingV1` keeps clean entities, references,
    relations, procedure logic, experiment logic, knowledge graph,
    canonical summary, LoRA generation hints, and training quality.
- RAG projections must not include `source_layer`, raw AST payloads,
  full LNF, prediction instances, or procedure training pairs.
- Training understanding projections must not include `source_layer`,
  raw AST payloads, render/layout/DOCX/HTML data, prediction instances,
  chemistry feature vectors, or full LNF. Field-level source spans are allowed
  only on `knowledge_graph.field_evidence[*].source_span`, not on clean
  `entities.*` records.
- `ChemdTrainingUnderstandingV1.knowledge_graph` must preserve:
  - exported entity/narrative nodes
  - condition variation nodes
  - condition variation attempt nodes
  - semantic relation edges
  - procedure, canonical step, observation, and observation event nodes
  - procedure/observation logic edges such as procedure-to-step ordering
  - field-value and normalized-value nodes for training-relevant fields
  - raw-to-normalized value edges when normalization is available
  - field-level evidence for molecule, reaction, result, analysis, sample,
    and artifact fields when available
  - missing logic records for unresolved references or disconnected facts
- `ChemdTrainingUnderstandingV1.experiment_logic` must preserve:
  - primary entities and result/outcome links
  - derived experiment design contexts for baseline, variant, or single-run
    records without requiring additional author syntax
  - changed and controlled reaction variables when multiple reactions can be
    compared inside one document
  - outcome quality records that separate reported yield values from yield
    confidence, yield basis, analysis confirmation, and regression usability
  - conservative reaction taxonomy labels inferred from existing reaction
    names, participants, and conditions
  - expert routing labels derived from taxonomy, design contexts, outcome
    quality, and failure signals
  - optimization trajectories that summarize baseline/variant steps and best
    available outcomes without adding author-facing syntax
  - failure signals for failed, low-yield, low-conversion, low-selectivity,
    low-purity, conflicting, uncertain, or unlinked results
  - inferred intent hypotheses, variable logic, and causal links generated
    from existing facts without requiring extra report syntax
  - explicit condition variations and explicit changed variable logic from
    authored `condition-varies` blocks, using `logic_source: "explicit"`
  - implicit condition facts that recover controlled defaults only from
    authored `condition-varies` baselines or resolved standard reactions; they
    must never be inferred from bare free text alone
  - material flow graph nodes/edges derived from reaction participants,
    reaction/result/sample/artifact/analysis relations, and procedure step
    inputs/outputs
  - step dependency edges derived from explicit `dependsOn`, procedure order,
    previous-step outputs consumed by later steps, artifact outputs, and linked
    observation events
  - analysis/artifact evidence links and sample lineage links
  - sample profiles and artifact profiles that summarize practical lineage
    roles, attached evidence, and artifact usage without mutating source truth
  - evidence interpretations that map structured evidence into support,
    contradiction, identification, weakening, or quantification claims with
    field-level source references when available
- Reaction taxonomy, expert routing, optimization trajectories, and failure
  signals are derived experiment-understanding features. They must carry
  evidence IDs, warnings, and confidence where applicable, and must not be
  treated as human-verified labels unless an annotation layer later confirms
  them.
- Intent hypotheses, variable logic, and causal links are inferred logic. Each
  record must carry stable IDs, `logic_source`, confidence, evidence IDs, and a
  review flag. Automatically inferred records use `logic_source: "derived"`;
  future LLM suggestions must use `logic_source: "llm_suggested"` and stay
  outside source truth until accepted through annotation.
- Explicit `condition-varies` facts may enrich or override derived changed
  variable facts for the same reaction/field/role. The explicit record keeps
  raw author delta values (`baseline_value`, `candidate_value`) and high
  confidence only when both reaction references resolve and at least one change
  is present.
- Material flow graph edges and step dependency edges are inferred operational
  logic. Each edge must carry a stable ID, `logic_source`, confidence, evidence
  IDs, review semantics, and warnings. Positional-only step ordering must set
  `review_required: true` with a positional warning.
- Cross-document strategy understanding must be built in a separate aggregation
  layer. Single-document `ChemdTrainingUnderstandingV1` stays document-scoped,
  while `buildTrainingCampaignFromUnderstandings()` groups compatible runs into
  campaign trajectories and `buildTrainingCampaignTaskDataset()` emits
  cross-document strategy task examples.
- Compiler/editor authoring assistance may consume semantic-layer and
  understanding projections to generate conservative writing suggestions, but
  those suggestions stay outside source truth until a caller explicitly applies
  the exported source patch.
- `ChemdTrainingUnderstandingV1.resolved_references` must include Markdown
  references and structured `ref`/participant references that affect
  experiment logic, including `condition_varies.reaction` and
  `condition_varies.standard`, attempt reaction/result refs, and analysis refs
  targeting condition variation attempts.
- `learning_layer.prediction_instances` must avoid leaking linked result text
  into input features. Result entities remain linked as targets/evidence, while
  feature inputs should focus on reaction conditions, participants, quantities,
  and pre-outcome context.
- LoRA generation hints should distinguish extraction/summary tasks from
  experiment-decision tasks such as record-to-Chemd reconstruction,
  Chemd repair, normalization explanation, procedure reasoning, observation
  events, evidence tracing, evidence interpretation, QA with context, yield prediction, condition
  recommendation, experiment proposal, failure analysis, experiment comparison,
  reaction classification, and expert routing.
- LoRA/SFT JSONL must be generated from `ChemdTrainingUnderstandingV1`,
  not from RAG chunks or the full audit export.
- `buildTrainingTaskDatasetFromUnderstanding()` is the public task-projection
  API for experiment-decision SFT/LoRA samples. It consumes only
  `ChemdTrainingUnderstandingV1` and emits JSONL-ready `messages` examples for
  record-to-Chemd reconstruction, Chemd repair, normalization explanation,
  procedure reasoning, observation events, evidence tracing, evidence
  interpretation, reference
  resolution, relation extraction, QA with context, experiment intent, material
  flow reasoning, yield prediction, condition recommendation, experiment
  proposal, failure analysis, experiment comparison, reaction classification,
  and expert routing.
- `buildTrainingCampaignTaskDataset()` is the cross-document task-projection
  API. It consumes multiple `ChemdTrainingUnderstandingV1` records and emits
  `cross_document_strategy` examples without mutating any single-document
  schema.
- Task-projection examples are derived supervision. They must carry quality
  warnings and must not be treated as human-confirmed labels unless a later
  annotation layer explicitly adds that status.
- Task-projection examples must distinguish SFT and eval/holdout use through
  `quality.usable_for_sft`, `quality.usable_for_eval`, and `evaluation`.
  Open-ended heuristic recommendation/proposal labels should remain SFT-only
  unless a human annotation layer confirms them.
- Normalization explanation task inputs may include only the task name,
  `subject_entity_id`, `field`, `raw_value`, and `source_span`. Do not include
  the full field-evidence object or clean subject entity in the user prompt.
- Evidence tracing task inputs must not include the full field-evidence object.
  Automatically derived evidence tracing examples are SFT-only and must set
  `usable_for_eval: false`, `holdout_eligible: false`, and at least medium
  leakage risk unless later human annotations create a clean eval target.
- Reference-resolution task inputs may include raw references, source entity
  IDs/types/fields, target fields, and candidate entity summaries. They must not
  include the full `resolved_references` target array in the user prompt.
- Relation-extraction task inputs may include compact entities and reference
  facts without `relation_type`. They must not include the full `relations`
  target array in the user prompt.
- Experiment-intent task inputs must expose only source facts such as document
  metadata, reactions, authored condition variation facts, outcomes, procedure
  summaries, and evidence counts. They must not include `intent_hypotheses`,
  `variable_logic`, or `causal_links` in the user prompt. Derived or explicit
  experiment-intent examples are SFT-only by default unless human annotations
  later promote them.
- Material-flow reasoning task inputs must expose only source facts such as
  document metadata, reactions, samples, artifacts, relation types, and
  procedure step facts. They must not include `material_flow_graph` or
  `step_dependencies` in the user prompt. Derived material-flow examples are
  SFT-only by default.
- Task-projection prompts may include structured reaction/design/outcome facts,
  but must not include `source_layer`, raw AST payloads, render/layout fields,
  full audit export data, or RAG-only chunks.
- `ChemdTrainingAnnotationPatchV1` is the correction envelope for human review.
  It records corrected values and post-correction supervision status separately
  from automatic projections, so derived labels do not silently become
  human-verified labels.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Resolved reference | Emit a relation with `confidence: 1` |
| Unresolved reference | Keep source diagnostics from parser/typechecker; do not emit a relation |
| Literal participant | Keep participant as literal; do not emit molecule relation |
| Empty analysis/sample text | Do not emit an empty retrieval chunk |
| Empty artifact text | Do not emit an empty artifact retrieval chunk |
| Empty condition variation text | Do not emit an empty condition variation retrieval chunk |
| Duplicate relation source | Deduplicate by stable `relation_id` |
| Field source spans | Strip from clean entities; preserve on field evidence |
| Derived task label | Mark SFT/eval/holdout eligibility explicitly |
| Sample lineage target kind mismatch | Resolve the reference if possible, but do not emit or project a lineage relation |
| Multiple sample fields target same entity | Project only the relation whose role matches the source field |
| Derived evidence tracing task | Keep SFT eligible when warning-free, but never eval/holdout eligible |
| Reference-resolution task | Exclude full target references from prompt; keep derived examples SFT-only by default |
| Relation-extraction task | Exclude full target relations from prompt; keep derived examples SFT-only by default |
| Inferred intent/causal logic | Emit derived records with evidence IDs and review flags; do not treat as source truth |
| Explicit condition variation | Emit explicit condition variation logic; use low confidence and review-required if reaction or standard is unresolved |
| Explicit condition attempt | Emit attempt-level logic; use `resN` and `noteN` matching for result/note evidence |
| Implicit condition recovery | Only inherit defaults from authored condition baselines or resolved standard reactions; mark warnings when authored baseline is absent |
| Attempt reference from TLC/analysis | Emit `analysis_targets_condition_variation_attempt` when `ref` targets `@cv.varN` |
| Condition variation target kind mismatch | Resolve diagnostics normally, but do not emit candidate/standard semantic relation |
| Experiment-intent task | Keep SFT-only and exclude inferred target records from the prompt |
| Material flow graph | Emit derived graph edges only from resolved semantic links or step IO |
| Positional step dependency | Mark review-required with `positional_order_only` warning |
| Material-flow task | Keep SFT-only and exclude target graph fields from the prompt |
| Evidence interpretation task | Keep source prompts limited to evidence entities, target entities, and source refs; do not leak derived interpretation targets into the input beyond those facts |
| Cross-document strategy task | Require at least two documents in one grouped trajectory before emitting a campaign example |

### 5. Good/Base/Bad Cases

- Good: reaction + result + sample + analysis + artifact all connected through stable links.
- Good: `condition-varies` references a candidate and standard reaction, emits
  condition variation relations, and produces explicit changed variable logic.
- Good: `condition-varies` with `var1`/`var2` emits attempt entities, binds
  `res1`/`note1`, and lets TLC/analysis/observation reference `@cv.var1`.
- Good: attempt-level baseline inheritance emits implicit condition facts for
  controlled variables such as catalyst or atmosphere when they come from the
  authored baseline.
- Good: linked analysis/artifact evidence emits evidence-interpretation records
  with source refs and conservative support/weakening labels.
- Base: standalone document still emits a document summary chunk.
- Base: campaign aggregation emits no trajectory when only one document matches
  a series signature.
- Bad: unresolved `condition-varies.standard` must not invent a standard
  reaction relation and must keep review-required condition variation logic.
- Bad: unresolved `var1.result` must preserve the raw result ref but must not
  emit `condition_variation_attempt_has_result`.
- Bad: cross-document aggregation must not overwrite single-document design
  contexts or rewrite source-truth entities.

### 6. Tests Required

- Assert relation types, `from_entity_id`, and `to_entity_id`.
- Assert chunk types for document, analysis, sample, and artifact content.
- Assert chunk types for condition variation content when `text_for_embedding`
  is available.
- Assert source fields such as `ref_raw` remain visible where they explain links.
- Assert projections do not leak noisy full-export fields such as `raw_text`,
  `source_layer`, or `semantic_layer.lnf`.
- Assert training understanding includes knowledge graph nodes/edges,
  field-level evidence, normalization edges, procedure/observation logic,
  missing logic, and LoRA generation hints.
- Assert training understanding includes experiment design contexts and outcome
  quality without leaking source layer, render layout, clean-entity source
  spans, or full audit fields.
- Assert training understanding includes reaction taxonomy, expert routing,
  optimization trajectories, and failure signals with evidence IDs and warnings.
- Assert prediction instances link the correct result per reaction and do not
  apply a primary-result fallback to multiple unrelated reactions.
- Assert task-projection examples are generated from training understanding,
  expose `messages`, carry source entity IDs, and preserve derived-supervision
  warnings for weak labels.
- Assert task-projection examples expose SFT/eval/holdout metadata and that
  annotation patches remain separate from automatic derived supervision.
- Assert sample lineage, artifact evidence links, chemistry feature reference
  IDs, procedure step metadata, observation event metadata, field source spans,
  and task examples for procedure/observation/evidence/QA flows are present in
  the public projections.
- Assert mismatched `sample.aliquot_of`, `sample.batch_of`, and
  `sample.artifacts` targets do not create semantic relations and do not borrow
  relation types from another sample field.
- Assert normalization/evidence tracing task inputs do not expose full
  field-evidence objects, and evidence tracing examples are not eval/holdout
  eligible by default.
- Assert reference-resolution and relation-extraction task inputs do not expose
  full target arrays, while outputs include resolved, unresolved, and semantic
  relation labels.
- Assert inferred experiment intent, variable logic, and causal links are
  present for single-run and variant experiments, carry `logic_source`, and set
  review flags when evidence is weak.
- Assert explicit condition variation entities, references, semantic links,
  design contexts, variable logic, and experiment-intent inputs/outputs are
  present for `condition-varies` blocks.
- Assert condition variation attempts, `resN`/`noteN` matching,
  attempt-level references, TLC/analysis attempt links, and observation target
  metadata are present for `condition-varies` attempt blocks.
- Assert implicit condition facts are emitted only for supported inheritance
  paths and can drive controlled-variable task inputs without inventing bare
  free-text defaults.
- Assert sample profiles, artifact profiles, and evidence interpretations are
  present in training understanding and that evidence-interpretation examples
  are generated without leaking derived labels into prompts.
- Assert experiment-intent task examples are generated without leaking
  `intent_hypotheses`, `variable_logic`, or `causal_links` into user prompts.
- Assert material flow graph and step dependencies are present for reaction
  lineage, explicit procedure IO, linked observations, and previous-output
  consumption.
- Assert material-flow reasoning task examples are generated without leaking
  `material_flow_graph` or `step_dependencies` into user prompts.
- Assert cross-document campaign aggregation produces grouped trajectories and
  `cross_document_strategy` examples only when at least two documents share a
  trajectory signature.

### 7. Wrong vs Correct

#### Wrong

```ts
// Re-parse raw source inside exporter-training to find refs.
const reparsed = parseChemd(document.source ?? "");
```

#### Correct

```ts
// Use the resolved document and exported semantic entities already available.
const relation = createRelation(documentId, relationType, from.entity_id, to.entity_id);
```
