import { describe, expect, it } from "vitest";

import { buildCanonicalLnf } from "@chemd/lnf";
import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

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

  it("exports material, batch, and structured reaction participant links", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-material-batch
title: Export material batch
date: 2026-05-20
---

:::chemd #mol-aryl
kind: molecule
smiles: Brc1ccccc1
:::

:::chemd #mol-boron
kind: molecule
smiles: OB(O)c1ccccc1
:::

:::chemd #mol-product
kind: molecule
smiles: c1ccc(-c2ccccc2)cc1
:::

:::material #mat-aryl-lot-a
molecule: @mol-aryl
supplier: Sigma
lot: A123
purity: 98 %
:::

:::chemd #rxn-main
kind: reaction
reactant: @mat-aryl-lot-a | 1.0 mmol | 1.0 eq | limiting=true
reactant: @mol-boron | 1.5 eq
product: @mol-product
:::

:::batch #batch-crude
source: @rxn-main
molecule: @mol-product
state: crude
mass: 120 mg
purity: 84 %
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-05-20T00:00:00.000Z"
    });
    const reaction = record.semantic_layer.reactions[0];
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);

    expect(checked.diagnostics).toEqual([]);
    expect(record.semantic_layer.materials[0]).toMatchObject({
      original_id: "mat-aryl-lot-a",
      molecule_ref_raw: "@mol-aryl",
      purity_percent: 98
    });
    expect(record.semantic_layer.batches[0]).toMatchObject({
      original_id: "batch-crude",
      source_ref_raw: "@rxn-main",
      molecule_ref_raw: "@mol-product",
      mass: { value: 120, unit: "mg" },
      purity_percent: 84
    });
    expect(reaction).toMatchObject({
      reactants: expect.arrayContaining([
        expect.objectContaining({
          target_kind: "material",
          target_original_id: "mat-aryl-lot-a",
          amount: expect.objectContaining({ value: 1, unit: "mmol" }),
          equivalents: 1,
          limiting: true
        })
      ])
    });
    expect(relationTypes).toEqual(expect.arrayContaining([
      "material_is_molecule",
      "reaction_uses_material",
      "batch_derived_from_reaction",
      "batch_has_molecule"
    ]));
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
:::

:::chemd #rxn-main
kind: reaction
reactant: @mol-a | 1.2 mmol | 1.0 equiv | limiting=true
product: product
solvent: THF
temperature: 25 C
yield: 81 %
:::

:::result #res-main
status: success
yield: 80 %
purity: 95 %
:::

:::sample #sample-main
name: final product
purity: 95 %
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
      original_id: "mol-a",
      smiles: "CCO"
    });
    expect(record.semantic_layer.reactions[0]).toMatchObject({
      reactants: expect.arrayContaining([
        expect.objectContaining({
          amount: expect.objectContaining({ value: 1.2, unit: "mmol" }),
          equivalents: 1,
          limiting: true
        })
      ]),
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
yield: 80 %
notes: isolated product after workup
:::

:::sample #sample-main
ref: mol-product
name: final product
batch: B-001
purity: 95 %
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

describe("training export semantic cross-document records", () => {
  it("exports generic cross-document structured references into semantic links and understanding", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-export-cross-doc
title: Export cross doc refs
date: 2026-04-24
---

:::result #res-local
reaction: ext-doc#rxn-main
status: success
yield: 88 %
:::

:::sample #sample-local
derived_from: ext-doc#sample-parent
name: carried sample
:::

:::artifact #art-local
ref: ext-doc#res-main
kind: spectrum_pdf
path: data/result.pdf
:::

:::condition-varies #cv-local
reaction: ext-doc#rxn-main
standard: ext-doc#rxn-standard
var1: reaction=ext-doc#rxn-variant | result=ext-doc#res-variant | solvent=MeCN
:::

:::analysis #ana-local
type: tlc
ref: ext-doc#cv-local.var1
result: one spot
:::
`));
    const checked = typecheckDocument(document, {
      referenceContext: {
        externalTargets: [
          { refId: "ext-doc#rxn-main", targetKind: "reaction" },
          { refId: "ext-doc#rxn-standard", targetKind: "reaction" },
          { refId: "ext-doc#rxn-variant", targetKind: "reaction" },
          { refId: "ext-doc#res-main", targetKind: "result" },
          { refId: "ext-doc#res-variant", targetKind: "result" },
          { refId: "ext-doc#sample-parent", targetKind: "sample" },
          { refId: "ext-doc#cv-local.var1", targetKind: "condition_variation_attempt" }
        ]
      }
    });
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-04-24T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);

    expect(record.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "result_describes_reaction",
        from_entity_id: "res::exp-export-cross-doc::res-local",
        to_entity_id: "rxn::ext-doc::rxn-main"
      }),
      expect.objectContaining({
        relation_type: "sample_derived_from_sample",
        from_entity_id: "sam::exp-export-cross-doc::sample-local",
        to_entity_id: "sam::ext-doc::sample-parent"
      }),
      expect.objectContaining({
        relation_type: "artifact_supports_result",
        from_entity_id: "art::exp-export-cross-doc::art-local",
        to_entity_id: "res::ext-doc::res-main"
      }),
      expect.objectContaining({
        relation_type: "condition_variation_targets_reaction",
        from_entity_id: "cv::exp-export-cross-doc::cv-local",
        to_entity_id: "rxn::ext-doc::rxn-main"
      }),
      expect.objectContaining({
        relation_type: "condition_variation_attempt_has_result",
        from_entity_id: "cva::exp-export-cross-doc::cv-local.var1",
        to_entity_id: "res::ext-doc::res-variant"
      }),
      expect.objectContaining({
        relation_type: "analysis_targets_condition_variation_attempt",
        from_entity_id: "ana::exp-export-cross-doc::ana-local",
        to_entity_id: "cva::ext-doc::cv-local.var1"
      })
    ]));
    expect(understanding.resolved_references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        raw: "ext-doc#rxn-main",
        source_entity_id: "res::exp-export-cross-doc::res-local",
        source_field: "reaction",
        target_entity_id: "rxn::ext-doc::rxn-main",
        resolution_status: "resolved"
      }),
      expect.objectContaining({
        raw: "ext-doc#cv-local.var1",
        source_entity_id: "ana::exp-export-cross-doc::ana-local",
        source_field: "ref",
        target_entity_id: "cva::ext-doc::cv-local.var1",
        relation_type: "analysis_targets_condition_variation_attempt",
        resolution_status: "resolved"
      })
    ]));
    expect(understanding.knowledge_graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ node_id: "rxn::ext-doc::rxn-main", node_type: "reaction" }),
      expect.objectContaining({ node_id: "sam::ext-doc::sample-parent", node_type: "sample" }),
      expect.objectContaining({ node_id: "res::ext-doc::res-main", node_type: "result" }),
      expect.objectContaining({ node_id: "cva::ext-doc::cv-local.var1", node_type: "condition_variation_attempt" })
    ]));
  });
});
