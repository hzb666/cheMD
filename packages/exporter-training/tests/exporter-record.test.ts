import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

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

:::molecule #mol-a
name: Ethanol
smiles: CCO
:::

:::molecule #mol-b
name: Acetic acid
smiles: CC(=O)O
:::

:::reaction #rxn-main
reactants: @mol-a | O=O
products: @mol-b
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

:::reaction #rxn-main
reactants: CCO
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
});
