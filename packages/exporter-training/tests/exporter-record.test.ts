import { describe, expect, it } from "vitest";

import { buildCanonicalLnf } from "@chemd/lnf";
import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildTrainingTaskDatasetFromUnderstanding,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

type TaskExample = ReturnType<typeof buildTrainingTaskDatasetFromUnderstanding>["examples"][number];

const parseTaskUserInput = (example: TaskExample | undefined): Record<string, unknown> =>
  JSON.parse(example?.messages.find((message) => message.role === "user")?.content ?? "{}") as Record<string, unknown>;

const artifactTrainingSource = `---
id: exp-export-artifacts
title: Export artifacts
date: 2026-04-23
primary_result: res-main
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
solvent: THF
yield: 74%
chemistry_features: rxn-fp
:::

:::result #res-main
ref: rxn-main
status: success
yield: 72%
notes: isolated yield confirmed by NMR
:::

:::sample #sample-parent
name: crude batch
:::

:::sample #sample-main
derived_from: rxn-main
aliquot_of: sample-parent
batch_of: sample-parent
artifacts: spec-main
purity: 96%
chemistry_features: sample-desc
:::

:::artifact #spec-main
kind: nmr_spectrum
ref: res-main
path: data/nmr/spec-main.pdf
checksum: sha256:abc
instrument: Bruker 400
notes: clean product spectrum
chemistry_features: spec-vector
:::

:::analysis #ana-nmr
type: nmr
ref: res-main
method: 1H NMR
result: clean product spectrum
:::

:::procedure #proc-main
reaction: rxn-main
evidence: notebook-7
step: add | id=s-add | stage=charging | purpose=form product | evidence=notebook-7 | confidence=0.95
:::

:::observation #obs-main
ref: rxn-main
event: color_change | id=e-color | timepoint=after addition | severity=low | evidence=photo-1 | confidence=0.8 | linkedStep=s-add
:::
`;

describe("training export", () => {
  it("includes canonical LNF and procedure lowering pairs when provided", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export
title: Export test
date: 2026-04-17
---

:::procedure #proc-main
1. 冷却至 0 °C。
:::

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
solvent: THF
:::
`));
    const checked = typecheckDocument(document);
    const lnf = buildCanonicalLnf({
      document,
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      diagnostics: checked.diagnostics
    });
    const record = exportTrainingRecordFromDocument(document, {
      stepGraph: checked.stepGraph,
      typedGraph: checked.typedGraph,
      lnf,
      exportedAt: "2026-04-17T00:00:00.000Z"
    });

    expect(record.schema_version).toBe("chemd-training-export/v0.2");
    expect(record.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(record.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(record.learning_layer.procedure_to_steps?.[0]?.steps[0]?.family).toBe("cool");
    expect(record.learning_layer.procedure_to_steps?.[0]).toMatchObject({
      source_type: "lowered_prose",
      low_confidence_step_count: 0
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      syntax_origin: "chemd",
      declared_kind: "reaction",
      normalized_conditions: {
        solvent: {
          normalized: "tetrahydrofuran"
        }
      }
    });
    expect(record.source_layer.raw_children.find((node) => node.node_type === "procedure")).toMatchObject({
      source_block_type: "procedure"
    });
  });
});

describe("training export artifacts and projections", () => {
  it("exports artifacts, field source spans, sample lineage, and task projections", () => {
    const document = resolveChemd(parseChemd(artifactTrainingSource));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-04-23T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);
    const dataset = buildTrainingTaskDatasetFromUnderstanding(understanding);
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);
    const taskTypes = dataset.quality.task_types;
    const normalizationExample = dataset.examples.find((example) =>
      example.task_type === "normalization_explanation"
      && example.example_id.includes("res::exp-export-artifacts::res-main::yield_percent")
    );
    const evidenceTracingExample = dataset.examples.find((example) =>
      example.task_type === "evidence_tracing"
      && example.example_id.includes("res::exp-export-artifacts::res-main::yield_percent")
    );
    const experimentIntentExample = dataset.examples.find((example) =>
      example.task_type === "experiment_intent"
    );
    const normalizationInput = parseTaskUserInput(normalizationExample);
    const evidenceTracingInput = parseTaskUserInput(evidenceTracingExample);
    const experimentIntentInput = parseTaskUserInput(experimentIntentExample);

    expect(record.semantic_layer.artifacts[0]).toMatchObject({
      original_id: "spec-main",
      artifact_kind: "nmr_spectrum",
      ref_raw: "res-main",
      path: "data/nmr/spec-main.pdf",
      chemistry_feature_ref_ids: ["spec-vector"],
      field_source_spans: {
        path: expect.objectContaining({ startLine: 3 })
      }
    });
    expect(record.semantic_layer.samples.find((sample) => sample.original_id === "sample-main")).toMatchObject({
      derived_from_raw: "rxn-main",
      aliquot_of_raw: "sample-parent",
      batch_of_raw: "sample-parent",
      artifact_refs_raw: ["spec-main"],
      chemistry_feature_ref_ids: ["sample-desc"]
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      chemistry_feature_ref_ids: ["rxn-fp"]
    });
    expect(relationTypes).toEqual(expect.arrayContaining([
      "sample_derived_from_reaction",
      "sample_aliquot_of_sample",
      "sample_batch_of_sample",
      "sample_has_artifact",
      "artifact_supports_result",
      "analysis_targets_result"
    ]));
    expect(record.learning_layer.retrieval_chunks).toContainEqual(expect.objectContaining({
      chunk_type: "artifact_notes",
      source_entity_ids: ["art::exp-export-artifacts::spec-main"],
      text: expect.stringContaining("data/nmr/spec-main.pdf")
    }));
    expect(record.quality_layer.training_quality).toMatchObject({
      sft_eligible: expect.any(Boolean),
      eval_eligible: expect.any(Boolean),
      regression_eligible: expect.any(Boolean),
      review_required: expect.any(Boolean)
    });
    expect(understanding.entities.artifacts[0]).not.toHaveProperty("field_source_spans");
    expect(understanding.knowledge_graph.field_evidence).toContainEqual(expect.objectContaining({
      subject_entity_id: "res::exp-export-artifacts::res-main",
      field: "yield_percent",
      source_span: expect.objectContaining({ startLine: 3 }),
      evidence_entity_ids: expect.arrayContaining([
        "ana::exp-export-artifacts::ana-nmr",
        "art::exp-export-artifacts::spec-main"
      ])
    }));
    expect(understanding.experiment_logic.evidence_links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "artifact",
        relation_type: "artifact_supports_result"
      })
    ]));
    expect(understanding.experiment_logic.sample_lineage).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation_type: "sample_has_artifact" })
    ]));
    expect(understanding.experiment_logic.intent_hypotheses).toContainEqual(expect.objectContaining({
      intent_kind: "characterization",
      logic_source: "derived",
      confidence: "high",
      evidence_entity_ids: expect.arrayContaining([
        "rxn::exp-export-artifacts::rxn-main",
        "res::exp-export-artifacts::res-main",
        "ana::exp-export-artifacts::ana-nmr"
      ])
    }));
    expect(understanding.experiment_logic.causal_links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        link_type: "procedure_enables_reaction",
        logic_source: "derived"
      }),
      expect.objectContaining({
        link_type: "evidence_supports_outcome_claim",
        source_entity_ids: ["art::exp-export-artifacts::spec-main"],
        target_entity_ids: ["res::exp-export-artifacts::res-main"]
      })
    ]));
    expect(understanding.procedure_logic.procedure_to_steps[0]?.steps[0]).toMatchObject({
      stepId: "s-add",
      stage: "charging",
      purpose: "form product",
      evidence: ["notebook-7"],
      loweringConfidence: 0.95
    });
    expect(understanding.procedure_logic.observation_to_events[0]?.events[0]).toMatchObject({
      eventId: "e-color",
      timepoint: "after addition",
      severity: "low",
      evidence: ["photo-1"],
      confidence: 0.8
    });
    expect(taskTypes).toEqual(expect.arrayContaining([
      "record_to_chemd",
      "normalization_explanation",
      "procedure_reasoning",
      "observation_events",
      "evidence_tracing",
      "experiment_intent",
      "qa_with_context"
    ]));
    expect(normalizationInput).toMatchObject({
      task: "normalization_explanation",
      subject_entity_id: "res::exp-export-artifacts::res-main",
      field: "yield_percent",
      raw_value: "72%"
    });
    expect(normalizationInput).not.toHaveProperty("field_evidence");
    expect(normalizationInput).not.toHaveProperty("subject");
    expect(evidenceTracingExample).toMatchObject({
      quality: expect.objectContaining({ usable_for_eval: false }),
      evaluation: expect.objectContaining({
        holdout_eligible: false,
        leakage_risk: "medium"
      })
    });
    expect(evidenceTracingInput).toMatchObject({
      task: "evidence_tracing",
      claim: expect.objectContaining({
        subject_entity_id: "res::exp-export-artifacts::res-main",
        field: "yield_percent"
      })
    });
    expect(evidenceTracingInput).not.toHaveProperty("field_evidence");
    expect(experimentIntentExample).toMatchObject({
      quality: expect.objectContaining({ usable_for_eval: false }),
      evaluation: expect.objectContaining({
        holdout_eligible: false,
        leakage_risk: "medium"
      })
    });
    expect(experimentIntentInput).toMatchObject({
      task: "experiment_intent",
      evidence_link_count: 2,
      sample_lineage_count: 4
    });
    expect(experimentIntentInput).not.toHaveProperty("intent_hypotheses");
    expect(experimentIntentInput).not.toHaveProperty("causal_links");
  });

  it("infers optimization intent and causal variable logic from reaction variants", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-intent-variants
title: Intent variants
date: 2026-04-23
---

:::chemd #rxn-base
kind: reaction
reactants: substrate
products: product
solvent: THF
yield: 40%
:::

:::result #res-base
ref: rxn-base
status: partial
yield: 40%
:::

:::chemd #rxn-variant
kind: reaction
reactants: substrate
products: product
solvent: MeCN
yield: 75%
:::

:::result #res-variant
ref: rxn-variant
status: success
yield: 75%
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      exportedAt: "2026-04-23T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);
    const dataset = buildTrainingTaskDatasetFromUnderstanding(understanding);
    const variantIntent = understanding.experiment_logic.intent_hypotheses.find((intent) =>
      intent.reaction_entity_id === "rxn::exp-intent-variants::rxn-variant"
    );

    expect(variantIntent).toMatchObject({
      intent_kind: "optimization",
      objective: "Compare the effect of changed variable(s): solvent.",
      logic_source: "derived",
      review_required: true,
      supporting_factors: expect.arrayContaining(["changed:solvent"])
    });
    expect(understanding.experiment_logic.variable_logic).toContainEqual(expect.objectContaining({
      reaction_entity_id: "rxn::exp-intent-variants::rxn-variant",
      field: "solvent",
      variable_role: "changed",
      baseline_value: "tetrahydrofuran",
      candidate_value: "acetonitrile",
      logic_source: "derived"
    }));
    expect(understanding.experiment_logic.causal_links).toContainEqual(expect.objectContaining({
      link_type: "changed_variable_may_affect_outcome",
      cause: "solvent changed between baseline and candidate.",
      target_entity_ids: ["res::exp-intent-variants::res-variant"]
    }));
    expect(dataset.quality.task_types).toContain("experiment_intent");
  });

  it("does not create lineage relations for mismatched sample target kinds", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-lineage-mismatch
title: Export lineage mismatch
date: 2026-04-23
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
:::

:::sample #sample-main
derived_from: rxn-main
aliquot_of: rxn-main
batch_of: spec-main
artifacts: rxn-main
:::

:::artifact #spec-main
kind: nmr_spectrum
ref: rxn-main
path: data/spec-main.pdf
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      exportedAt: "2026-04-23T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);
    const sampleReferences = understanding.resolved_references.filter((reference) =>
      reference.source_entity_id === "sam::exp-lineage-mismatch::sample-main"
    );
    const aliquotReference = sampleReferences.find((reference) => reference.source_field === "aliquot_of");
    const batchReference = sampleReferences.find((reference) => reference.source_field === "batch_of");
    const artifactReference = sampleReferences.find((reference) => reference.source_field === "artifacts");

    expect(relationTypes).toContain("sample_derived_from_reaction");
    expect(relationTypes).not.toContain("sample_aliquot_of_sample");
    expect(relationTypes).not.toContain("sample_batch_of_sample");
    expect(relationTypes).not.toContain("sample_has_artifact");
    expect(aliquotReference).toMatchObject({
      resolution_status: "resolved",
      target_entity_id: "rxn::exp-lineage-mismatch::rxn-main"
    });
    expect(batchReference).toMatchObject({
      resolution_status: "resolved",
      target_entity_id: "art::exp-lineage-mismatch::spec-main"
    });
    expect(artifactReference).toMatchObject({
      resolution_status: "resolved",
      target_entity_id: "rxn::exp-lineage-mismatch::rxn-main"
    });
    expect(aliquotReference).not.toHaveProperty("relation_type");
    expect(batchReference).not.toHaveProperty("relation_type");
    expect(artifactReference).not.toHaveProperty("relation_type");
  });
});

describe("training export semantic records", () => {
  it("preserves all explicit step source text in procedure learning pairs", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-steps
title: Export explicit steps
date: 2026-04-17
---

:::procedure #proc-main
step: add | materials=A
step: heat | target_temperature=80 C
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      stepGraph: checked.stepGraph,
      typedGraph: checked.typedGraph,
      exportedAt: "2026-04-17T00:00:00.000Z"
    });

    expect(record.learning_layer.procedure_to_steps?.[0]?.source_text).toBe(
      ["step: add | materials=A", "step: heat | target_temperature=80 C"].join("\n")
    );
  });

  it("builds typed graph fallback for normalized semantic fields", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-fallback
title: Export fallback
date: 2026-04-18
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
solvent: THF
:::
`));
    const record = exportTrainingRecordFromDocument(document, {
      exportedAt: "2026-04-18T00:00:00.000Z"
    });

    expect(record.semantic_layer.reactions[0]?.normalized_conditions).toMatchObject({
      solvent: {
        normalized: "tetrahydrofuran"
      }
    });
  });

  it("exports CAS separately from SMILES for molecule semantics", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-cas
title: Export CAS
date: 2026-04-19
---

:::chemd #mol-cas
kind: molecule
cas: 64-17-5
name: ethanol
:::
`));
    const record = exportTrainingRecordFromDocument(document, {
      exportedAt: "2026-04-19T00:00:00.000Z"
    });

    expect(record.semantic_layer.molecules[0]).toMatchObject({
      original_id: "mol-cas",
      cas: "64-17-5",
      name: "ethanol"
    });
    expect(record.semantic_layer.molecules[0]).not.toMatchObject({ smiles: "64-17-5" });
  });

  it("uses typed graph and canonical LNF data for training features", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-typed
title: Export typed graph
date: 2026-04-19
primary_result: res-main
---

:::chemd #mol-a
kind: molecule
smiles: CCO
amount: 1.2 mmol
equivalents: 1.0 equiv
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-a
products: product
solvent: THF
temperature: 25 C
yield: 81%
:::

:::result #res-main
status: success
yield: 80%
purity: 95%
:::

:::sample #sample-main
name: final product
purity: 95%
:::
`));
    const checked = typecheckDocument(document);
    const lnf = buildCanonicalLnf({
      document,
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      diagnostics: checked.diagnostics
    });
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      lnf,
      exportedAt: "2026-04-19T00:00:00.000Z"
    });

    expect(record.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(record.semantic_layer.molecules[0]).toMatchObject({
      amount_value: { value: 1.2, unit: "mmol" },
      equivalents_value: 1
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      normalized_outcome_hints: {
        yield_percent: 81
      }
    });
    expect(record.semantic_layer.results[0]).toMatchObject({
      status_label: "success",
      yield_percent: 80,
      purity_percent: 95
    });
    expect(record.semantic_layer.samples[0]).toMatchObject({
      purity_percent: 95
    });
    expect(record.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(record.learning_layer.prediction_instances[0]).toMatchObject({
      targets: {
        status_class: "success",
        yield_percent: 80
      },
      usability: {
        usable_for_classification: true,
        usable_for_yield_regression: true
      }
    });
    expect(record.quality_layer.training_quality.prediction_eligible).toBe(true);
  });

  it("exports semantic fact links and retrieval chunks for analyses and samples", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-links
title: Export linked facts
date: 2026-04-20
primary_result: res-main
---

:::chemd #mol-start
kind: molecule
smiles: CCO
name: ethanol
:::

:::chemd #mol-product
kind: molecule
smiles: CC(=O)O
name: acetic acid
:::

:::chemd #rxn-main
kind: reaction
reactants: @mol-start
products: @mol-product
solvent: THF
:::

:::result #res-main
ref: rxn-main
status: success
yield: 80%
notes: isolated product after workup
:::

:::sample #sample-main
ref: mol-product
name: final product
batch: B-001
purity: 95%
notes: stored under nitrogen
:::

:::sample #sample-crude
ref: rxn-main
name: crude aliquot
notes: sampled before purification
:::

:::analysis #ana-sample
type: nmr
ref: sample-main
instrument: Bruker 400
data: data/nmr/sample-main.pdf
notes: clean spectrum
:::

:::analysis #ana-rxn
type: tlc
ref: rxn-main
data: one major product spot
:::

Linked notes mention @rxn-main and @res-main.yield.
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-04-20T00:00:00.000Z"
    });
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);
    const chunkTypes = record.learning_layer.retrieval_chunks.map((chunk) => chunk.chunk_type);

    expect(relationTypes).toEqual(expect.arrayContaining([
      "document_primary",
      "reaction_uses_molecule",
      "reaction_produces_molecule",
      "result_describes_reaction",
      "sample_related_to_molecule",
      "sample_derived_from_reaction",
      "analysis_targets_sample",
      "analysis_targets_reaction",
      "markdown_mentions_entity"
    ]));
    expect(record.semantic_layer.links).toContainEqual(expect.objectContaining({
      relation_type: "analysis_targets_sample",
      from_entity_id: "ana::exp-export-links::ana-sample",
      to_entity_id: "sam::exp-export-links::sample-main"
    }));
    expect(record.semantic_layer.links).toContainEqual(expect.objectContaining({
      relation_type: "result_describes_reaction",
      from_entity_id: "res::exp-export-links::res-main",
      to_entity_id: "rxn::exp-export-links::rxn-main"
    }));
    expect(chunkTypes).toEqual(expect.arrayContaining([
      "document_summary",
      "analysis_notes",
      "sample_notes"
    ]));
    expect(record.learning_layer.retrieval_chunks).toContainEqual(expect.objectContaining({
      chunk_type: "analysis_notes",
      source_entity_ids: ["ana::exp-export-links::ana-sample"],
      text: expect.stringContaining("data/nmr/sample-main.pdf")
    }));
    expect(record.learning_layer.retrieval_chunks).toContainEqual(expect.objectContaining({
      chunk_type: "sample_notes",
      source_entity_ids: ["sam::exp-export-links::sample-crude"],
      text: expect.stringContaining("sampled before purification")
    }));
  });

});
