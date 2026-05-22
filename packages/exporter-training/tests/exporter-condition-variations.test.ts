import { describe, expect, it } from "vitest";

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

const parseTaskAssistantOutput = (example: TaskExample | undefined): Record<string, unknown> =>
  JSON.parse(example?.messages.find((message) => message.role === "assistant")?.content ?? "{}") as Record<string, unknown>;

describe("training export condition variations", () => {
  it("exports explicit condition variation logic into training tasks", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-condition-varies
title: Condition varies
date: 2026-04-23
---

:::chemd #rxn-standard
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
yield: 40%
:::

:::result #res-standard
ref: rxn-standard
status: partial
yield: 40%
:::

:::chemd #rxn-variant
kind: reaction
reactants: substrate
products: product
solvent: MeCN
temperature: 40 C
yield: 78%
:::

:::result #res-variant
ref: rxn-variant
status: success
yield: 78%
:::

:::condition-varies #cv-solvent-temperature
standard: @rxn-standard
factor: solvent | baseline=THF
factor: temperature | baseline=25 C
outcome: yield | baseline=40%

attempt: var1
reaction: @rxn-variant
result: @res-variant
solvent: MeCN
temperature: 40 C
yield: 78%
note: Candidate improves yield under warmer MeCN conditions.
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      exportedAt: "2026-04-23T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);
    const dataset = buildTrainingTaskDatasetFromUnderstanding(understanding);
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);
    const intentExample = dataset.examples.find((example) => example.task_type === "experiment_intent");
    const intentInput = parseTaskUserInput(intentExample);
    const intentOutput = parseTaskAssistantOutput(intentExample);

    expect(record.source_layer.raw_children).toContainEqual(expect.objectContaining({
      node_type: "condition_varies",
      original_id: "cv-solvent-temperature"
    }));
    expect(record.semantic_layer.condition_variations[0]).toMatchObject({
      original_id: "cv-solvent-temperature",
      standard_ref_raw: "@rxn-standard",
      condition: [
        { field: "solvent", baseline_raw: "THF" },
        { field: "temperature", baseline_raw: "25 C" }
      ],
      vary_fields: ["solvent", "temperature"],
      attempt_entity_ids: [
        "cva::exp-condition-varies::cv-solvent-temperature.var1"
      ]
    });
    expect(relationTypes).toEqual(expect.arrayContaining([
      "condition_variation_compares_standard",
      "condition_variation_has_attempt",
      "condition_variation_attempt_targets_reaction",
      "condition_variation_attempt_has_result"
    ]));
    expect(record.semantic_layer.condition_variation_attempts[0]).toMatchObject({
      entity_id: "cva::exp-condition-varies::cv-solvent-temperature.var1",
      reaction_ref_raw: "@rxn-variant",
      result_ref_raw: "@res-variant",
      changes: expect.arrayContaining([
        expect.objectContaining({ field: "solvent", candidate_raw: "MeCN" })
      ])
    });
    expect(understanding.resolved_references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_entity_type: "condition_variation_attempt",
        source_field: "reaction",
        target_original_id: "rxn-variant"
      }),
      expect.objectContaining({
        source_entity_type: "condition_varies",
        source_field: "standard",
        target_original_id: "rxn-standard"
      })
    ]));
    expect(understanding.experiment_logic.condition_variations[0]).toMatchObject({
      logic_source: "explicit",
      confidence: "high",
      condition_variation_attempt_entity_id: "cva::exp-condition-varies::cv-solvent-temperature.var1",
      reaction_entity_id: "rxn::exp-condition-varies::rxn-variant",
      standard_reaction_entity_id: "rxn::exp-condition-varies::rxn-standard"
    });
    expect(understanding.experiment_logic.variable_logic).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-condition-varies::rxn-variant",
        field: "solvent",
        variable_role: "changed",
        baseline_value: "THF",
        candidate_value: "MeCN",
        logic_source: "explicit"
      })
    ]));
    expect(understanding.experiment_logic.intent_hypotheses).toContainEqual(expect.objectContaining({
      reaction_entity_id: "rxn::exp-condition-varies::rxn-variant",
      intent_kind: "optimization",
      logic_source: "explicit",
      confidence: "high"
    }));
    expect(intentInput).toMatchObject({
      task: "experiment_intent",
      condition_variations: [
        expect.objectContaining({
          condition_variation_entity_id: "cv::exp-condition-varies::cv-solvent-temperature"
        })
      ]
    });
    expect(intentOutput).toMatchObject({
      variable_logic: expect.arrayContaining([
        expect.objectContaining({ logic_source: "explicit", field: "solvent" })
      ])
    });
    expect(dataset.quality.task_types).toEqual(expect.arrayContaining([
      "reference_resolution",
      "relation_extraction",
      "experiment_intent",
      "condition_recommendation",
      "experiment_comparison"
    ]));
  });
});
