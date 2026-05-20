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

describe("training export condition variation attempts", () => {
  it("exports condition variation attempts and attempt-level evidence references", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-condition-attempts
title: Condition attempts
date: 2026-04-23
---

:::chemd #rxn-standard
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
yield: 40 %
:::

:::result #res-standard
ref: rxn-standard
status: partial
yield: 40 %
:::

:::chemd #rxn-var1
kind: reaction
reactants: substrate
products: product
solvent: MeCN
temperature: 40 C
yield: 78 %
:::

:::result #res-var1
ref: rxn-var1
status: success
yield: 78 %
:::

:::chemd #rxn-var2
kind: reaction
reactants: substrate
products: product
solvent: DMSO
temperature: 60 C
yield: 12 %
:::

:::result #res-var2
ref: rxn-var2
status: partial
yield: 12 %
:::

:::condition-varies #cv-screen
standard: rxn-standard
condition: solvent=THF | temperature=25 C | catalyst=Pd
varies: solvent | temperature
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
res1: res-var1
note1: Better yield but impurity visible.
var2: reaction=rxn-var2 | mode=override | solvent=DMSO | temperature=60 C | catalyst=Ni
res2: res-var2
note2: Low conversion by TLC.
:::

:::analysis #tlc-var1
type: tlc
ref: @cv-screen.var1
result: one major spot and faint impurity
:::

:::observation #obs-var1
ref: @cv-screen.var1
event: color_change | id=e-var1 | timepoint=after heating | severity=low | confidence=0.9
:::
`));
    const checked = typecheckDocument(document);
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph,
      stepGraph: checked.stepGraph,
      exportedAt: "2026-04-23T00:00:00.000Z"
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);
    const dataset = buildTrainingTaskDatasetFromUnderstanding(understanding);
    const relationTypes = record.semantic_layer.links.map((link) => link.relation_type);
    const conditionExample = dataset.examples.find((example) =>
      example.task_type === "condition_recommendation"
      && example.example_id.includes("res::exp-condition-attempts::res-var1")
    );
    const conditionInput = parseTaskUserInput(conditionExample);

    expect(record.semantic_layer.condition_variations[0]).toMatchObject({
      original_id: "cv-screen",
      condition: expect.arrayContaining([
        expect.objectContaining({ field: "solvent", baseline_raw: "THF" })
      ]),
      vary_fields: ["solvent", "temperature"],
      attempt_entity_ids: [
        "cva::exp-condition-attempts::cv-screen.var1",
        "cva::exp-condition-attempts::cv-screen.var2"
      ]
    });
    expect(record.semantic_layer.condition_variation_attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_id: "cva::exp-condition-attempts::cv-screen.var1",
        original_id: "cv-screen.var1",
        attempt_id: "var1",
        reaction_ref_raw: "rxn-var1",
        result_ref_raw: "res-var1",
        note: "Better yield but impurity visible.",
        condition: expect.arrayContaining([
          expect.objectContaining({ field: "catalyst", candidate_raw: "Pd" }),
          expect.objectContaining({ field: "solvent", candidate_raw: "MeCN" })
        ])
      })
    ]));
    expect(relationTypes).toEqual(expect.arrayContaining([
      "condition_variation_has_attempt",
      "condition_variation_attempt_targets_reaction",
      "condition_variation_attempt_has_result",
      "analysis_targets_condition_variation_attempt"
    ]));
    expect(record.learning_layer.observation_to_events?.[0]).toMatchObject({
      observation_id: "obs-var1",
      ref_raw: "@cv-screen.var1",
      target_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
      target_entity_type: "condition_variation_attempt"
    });
    expect(understanding.entities.condition_variation_attempts).toContainEqual(expect.objectContaining({
      entity_id: "cva::exp-condition-attempts::cv-screen.var1",
      attempt_id: "var1"
    }));
    expect(understanding.resolved_references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_entity_type: "condition_variation_attempt",
        source_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
        source_field: "result",
        target_original_id: "res-var1"
      }),
      expect.objectContaining({
        source_entity_type: "analysis",
        source_field: "ref",
        target_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
        relation_type: "analysis_targets_condition_variation_attempt"
      })
    ]));
    expect(understanding.experiment_logic.condition_variations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        condition_variation_attempt_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
        attempt_id: "var1",
        reaction_entity_id: "rxn::exp-condition-attempts::rxn-var1",
        result_entity_id: "res::exp-condition-attempts::res-var1",
        standard_reaction_entity_id: "rxn::exp-condition-attempts::rxn-standard",
        confidence: "high"
      })
    ]));
    expect(understanding.experiment_logic.variable_logic).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-condition-attempts::rxn-var1",
        field: "solvent",
        candidate_value: "MeCN",
        logic_source: "explicit"
      }),
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-condition-attempts::rxn-var1",
        field: "catalyst",
        variable_role: "controlled",
        value: "Pd",
        logic_source: "explicit"
      })
    ]));
    expect(understanding.experiment_logic.implicit_condition_facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-condition-attempts::rxn-var1",
        condition_variation_attempt_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
        field: "catalyst",
        value: "Pd",
        source: "condition_varies_attempt_inheritance"
      })
    ]));
    expect(conditionInput).toMatchObject({
      condition_variations: expect.arrayContaining([
        expect.objectContaining({
          condition_variation_attempt_entity_id: "cva::exp-condition-attempts::cv-screen.var1",
          attempt_id: "var1"
        })
      ]),
      implicit_condition_facts: expect.arrayContaining([
        expect.objectContaining({
          field: "catalyst",
          value: "Pd"
        })
      ])
    });
  });
});
