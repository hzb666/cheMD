import { describe, expect, it } from "vitest";

import { parseChemd } from "../../parser/src";
import { resolveChemd } from "../../resolver/src";

import { exportTrainingRecordFromDocument } from "../src";

describe("exportTrainingRecordFromDocument", () => {
  it("exports stage-1 training record from resolved document with stable semantic ids", () => {
    const source = `---
id: exp-training-001
title: Training Export
date: 2026-03-31
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #mol-a
name: Ethanol
smiles: CCO
:::

:::chemd #mol-b
name: Acetic acid
smiles: CC(=O)O
:::

:::chemd #rxn-main
reac: @mol-a | O=O
prod: @mol-b
conditions: air | 4 h
temperature: 90 C
:::

:::result #res-main
status: success
yield: 78%
notes: clean reaction
:::

Summary: @res-main.yield`;

    const resolved = resolveChemd(parseChemd(source));
    const record = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-03-31T00:00:00.000Z",
      exportId: "export::exp-training-001::fixed"
    });

    expect(record.schema_version).toBe("chemd-training-export/v0.1");
    expect(record.export_id).toBe("export::exp-training-001::fixed");
    expect(record.document.document_id).toBe("exp-training-001");

    expect(record.source_layer.raw_children).toHaveLength(resolved.children.length);
    expect(record.source_layer.diagnostics).toEqual([]);

    expect(record.semantic_layer.molecules.map((item) => item.entity_id)).toEqual([
      "mol::exp-training-001::mol-a",
      "mol::exp-training-001::mol-b"
    ]);

    const reaction = record.semantic_layer.reactions[0];
    expect(reaction.entity_id).toBe("rxn::exp-training-001::rxn-main");
    expect(reaction.is_primary).toBe(true);
    expect(reaction.reactants[0]).toMatchObject({
      role: "reactant",
      reference_status: "resolved",
      target_entity_id: "mol::exp-training-001::mol-a"
    });
    expect(reaction.reactants[1]).toMatchObject({
      role: "reactant",
      reference_status: "literal",
      raw: "O=O"
    });
    expect(reaction.products[0]).toMatchObject({
      role: "product",
      reference_status: "resolved",
      target_entity_id: "mol::exp-training-001::mol-b"
    });
    expect(reaction.conditions_raw).toEqual(["air", "4 h"]);
    expect(reaction.normalized_conditions).not.toHaveProperty("conditions_text");

    const markdown = record.semantic_layer.markdown_blocks.find((item) => item.raw_text.includes("Summary:"));
    expect(markdown?.entity_id).toMatch(/^md::exp-training-001::\d+$/);
    expect(markdown?.references[0]).toMatchObject({
      kind: "object_field",
      source: "res-main",
      resolution_status: "resolved",
      resolution_value: "78%"
    });

    expect(record.semantic_layer.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation_type: "document_primary",
          to_entity_id: "rxn::exp-training-001::rxn-main"
        }),
        expect.objectContaining({
          relation_type: "document_primary",
          to_entity_id: "res::exp-training-001::res-main"
        })
      ])
    );

    expect(record.quality_layer.parse_quality).toEqual({
      diagnostic_counts: {
        info: 0,
        warning: 0,
        error: 0
      },
      has_errors: false
    });
    expect(record.learning_layer.retrieval_chunks).toEqual([]);
    expect(record.learning_layer.prediction_instances).toEqual([]);
  });

  it("propagates diagnostics and parse quality counts", () => {
    const source = `---
id: exp-training-err
title: Training Export Errors
date: 2026-03-31
---

:::chemd #rxn-main
reac: CCO
:::

Unknown: @res-missing.yield`;

    const resolved = resolveChemd(parseChemd(source));
    const record = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-03-31T00:00:00.000Z"
    });

    expect(record.source_layer.diagnostics.length).toBeGreaterThan(0);
    expect(record.quality_layer.parse_quality.has_errors).toBe(true);
    expect(record.quality_layer.parse_quality.diagnostic_counts.error).toBeGreaterThan(0);
    expect(record.quality_layer.parse_quality.diagnostic_counts.warning).toBeGreaterThan(0);
    expect(record.quality_layer.training_quality.confidence_score).toBeLessThan(1);
  });

  it("exports nested col layout entities and markdown blocks", () => {
    const source = `---
id: exp-training-col
title: Training Export Col
date: 2026-04-02
primary_result: res-main
---

:::result #res-main
yield: 63%
:::

:::col-2
col: {:::chemd #mol-inline
name: Inline Ethanol
smiles: CCO
:::}
col: @res-main.yield
:::`;

    const resolved = resolveChemd(parseChemd(source));
    const record = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-04-02T00:00:00.000Z",
      exportId: "export::exp-training-col::fixed"
    });

    expect(record.semantic_layer.molecules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity_id: "mol::exp-training-col::mol-inline",
          original_id: "mol-inline",
          smiles: "CCO"
        })
      ])
    );

    expect(record.semantic_layer.markdown_blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw_text: "@res-main.yield",
          references: [
            expect.objectContaining({
              source: "res-main",
              resolution_status: "resolved",
              resolution_value: "63%"
            })
          ]
        })
      ])
    );

    expect(record.source_layer.raw_children).toEqual([
      expect.objectContaining({
        node_index: 0,
        node_type: "result",
        original_id: "res-main"
      }),
      expect.objectContaining({
        node_index: 1,
        node_type: "col",
        raw_payload: expect.objectContaining({
          columns: 2,
          children: [
            expect.objectContaining({
              type: "molecule",
              id: "mol-inline"
            }),
            expect.objectContaining({
              type: "markdown",
              value: "@res-main.yield"
            })
          ]
        })
      })
    ]);
  });

  it("uses a stable default export id for identical documents", () => {
    const source = `---
id: exp-training-stable
title: Stable Export ID
date: 2026-04-02
---

Summary block.`;

    const resolved = resolveChemd(parseChemd(source));
    const first = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-04-02T00:00:00.000Z"
    });
    const second = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-04-03T00:00:00.000Z"
    });

    expect(first.export_id).toBe(second.export_id);
    expect(first.export_id).toMatch(/^export::exp-training-stable::[a-f0-9]{8}$/);
  });

  it("keeps procedure and observation in source snapshots while preserving semantic analysis export", () => {
    const source = `---
id: exp-training-procedure
title: Procedure Source Export
date: 2026-04-11
---

:::procedure #proc-1
ref: rxn-main
将底物溶于无水 THF，冰浴下缓慢滴加试剂。
:::

:::observation #obs-1
ref: proc-1
滴加过程中体系由无色逐渐变为浅黄色，并有轻微放热。
:::

:::analysis #ana-tlc-1
type: tlc;; time: 0.5 h;; eluent: PE/EA = 4:1
p1: sm 0.60 ^5(4) | mess(0.10) 3(2)
:::
`;

    const resolved = resolveChemd(parseChemd(source));
    const record = exportTrainingRecordFromDocument(resolved, {
      exportedAt: "2026-04-11T00:00:00.000Z",
      exportId: "export::exp-training-procedure::fixed"
    });

    expect(record.source_layer.raw_children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_type: "procedure",
          original_id: "proc-1",
          raw_payload: expect.objectContaining({
            type: "procedure",
            body: "将底物溶于无水 THF，冰浴下缓慢滴加试剂。"
          })
        }),
        expect.objectContaining({
          node_type: "observation",
          original_id: "obs-1",
          raw_payload: expect.objectContaining({
            type: "observation",
            body: "滴加过程中体系由无色逐渐变为浅黄色，并有轻微放热。"
          })
        })
      ])
    );

    expect(record.semantic_layer.analyses).toEqual([
      expect.objectContaining({
        original_id: "ana-tlc-1",
        analysis_type: "tlc",
        time_raw: "0.5 h",
        eluent_raw: "PE/EA = 4:1",
        plate_raw: "silica gel GF254",
        visualization_raw: "UV 254 nm",
        normalized_tlc: expect.objectContaining({
          time: expect.objectContaining({
            raw: "0.5 h",
            value: 0.5,
            unit: "h"
          }),
          lanes: [
            expect.objectContaining({
              lane_id: "p1",
              lane_role: "starting_material"
            })
          ]
        })
      })
    ]);
  });
});
