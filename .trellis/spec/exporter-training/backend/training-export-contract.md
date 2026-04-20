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
- `sample.ref` targeting a reaction/result/molecule produces the matching `sample_*` relation.
- Resolved Markdown references produce `markdown_mentions_entity`.
- `learning_layer.retrieval_chunks` must include available:
  - `document_summary`
  - `markdown`
  - `reaction_summary`
  - `result_notes`
  - `analysis_notes`
  - `sample_notes`
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
  raw AST payloads, source positions, render/layout/DOCX/HTML data,
  prediction instances, chemistry feature vectors, or full LNF.
- `ChemdTrainingUnderstandingV1.knowledge_graph` must preserve:
  - exported entity/narrative nodes
  - semantic relation edges
  - procedure, canonical step, observation, and observation event nodes
  - procedure/observation logic edges such as procedure-to-step ordering
  - field-value and normalized-value nodes for training-relevant fields
  - raw-to-normalized value edges when normalization is available
  - field-level evidence for molecule, reaction, result, analysis, and
    sample fields when available
  - missing logic records for unresolved references or disconnected facts
- `ChemdTrainingUnderstandingV1.experiment_logic` must preserve:
  - primary entities and result/outcome links
  - derived experiment design contexts for baseline, variant, or single-run
    records without requiring additional author syntax
  - changed and controlled reaction variables when multiple reactions can be
    compared inside one document
  - outcome quality records that separate reported yield values from yield
    confidence, yield basis, analysis confirmation, and regression usability
  - analysis evidence links and sample lineage links
- `ChemdTrainingUnderstandingV1.resolved_references` must include Markdown
  references and structured `ref`/participant references that affect
  experiment logic.
- `learning_layer.prediction_instances` must avoid leaking linked result text
  into input features. Result entities remain linked as targets/evidence, while
  feature inputs should focus on reaction conditions, participants, quantities,
  and pre-outcome context.
- LoRA generation hints should distinguish extraction/summary tasks from
  experiment-decision tasks such as yield prediction, condition recommendation,
  experiment proposal, failure analysis, and experiment comparison.
- LoRA/SFT JSONL must be generated from `ChemdTrainingUnderstandingV1`,
  not from RAG chunks or the full audit export.
- `buildTrainingTaskDatasetFromUnderstanding()` is the public task-projection
  API for experiment-decision SFT/LoRA samples. It consumes only
  `ChemdTrainingUnderstandingV1` and emits JSONL-ready `messages` examples for
  yield prediction, condition recommendation, experiment proposal, failure
  analysis, and experiment comparison.
- Task-projection examples are derived supervision. They must carry quality
  warnings and must not be treated as human-confirmed labels unless a later
  annotation layer explicitly adds that status.
- Task-projection prompts may include structured reaction/design/outcome facts,
  but must not include `source_layer`, raw AST payloads, render/layout fields,
  full audit export data, or RAG-only chunks.

### 4. Validation & Error Matrix

| Case | Behavior |
|------|----------|
| Resolved reference | Emit a relation with `confidence: 1` |
| Unresolved reference | Keep source diagnostics from parser/typechecker; do not emit a relation |
| Literal participant | Keep participant as literal; do not emit molecule relation |
| Empty analysis/sample text | Do not emit an empty retrieval chunk |
| Duplicate relation source | Deduplicate by stable `relation_id` |

### 5. Good/Base/Bad Cases

- Good: reaction + result + sample + analysis all connected through stable links.
- Base: standalone document still emits a document summary chunk.
- Bad: unresolved `ref` must not invent a relation.

### 6. Tests Required

- Assert relation types, `from_entity_id`, and `to_entity_id`.
- Assert chunk types for document, analysis, and sample content.
- Assert source fields such as `ref_raw` remain visible where they explain links.
- Assert projections do not leak noisy full-export fields such as `raw_text`,
  `source_layer`, or `semantic_layer.lnf`.
- Assert training understanding includes knowledge graph nodes/edges,
  field-level evidence, normalization edges, procedure/observation logic,
  missing logic, and LoRA generation hints.
- Assert training understanding includes experiment design contexts and outcome
  quality without leaking source layer, render layout, or full audit fields.
- Assert prediction instances link the correct result per reaction and do not
  apply a primary-result fallback to multiple unrelated reactions.
- Assert task-projection examples are generated from training understanding,
  expose `messages`, carry source entity IDs, and preserve derived-supervision
  warnings for weak labels.

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
