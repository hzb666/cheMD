import { describe, expect, it } from "vitest";

import { compileChemd } from "@chemd/compiler";

import {
  buildTrainingMemoryRecords
} from "./memory-loop";

const createSource = (input: {
  catalyst: string;
  yieldPercent: string;
}): string => `---
id: exp-memory-loop
title: Suzuki optimization
date: 2026-04-22
primary_reaction: rxn-main
primary_result: res-main
tags:
  - suzuki
---

:::chemd #aryl
kind: molecule
name: aryl bromide
smiles: Brc1ccccc1
:::

:::chemd #boron
kind: molecule
name: phenylboronic acid
smiles: OB(O)c1ccccc1
:::

:::chemd #product
kind: molecule
name: biphenyl
smiles: c1ccc(-c2ccccc2)cc1
:::

:::chemd #rxn-main
kind: reaction
name: Suzuki coupling
reactants: @aryl | @boron
products: @product
solvent: dioxane
catalyst: ${input.catalyst}
temperature: 80 C
yield: ${input.yieldPercent}
:::

:::result #res-main
reaction: @rxn-main
status: success
yield: ${input.yieldPercent}
:::
`;

const compileUnderstanding = (source: string) =>
  compileChemd(source).trainingUnderstanding;

describe("training memory loop records", () => {
  it("derives semantic memory records from a revision pair", () => {
    const beforeUnderstanding = compileUnderstanding(createSource({
      catalyst: "Pd(PPh3)4",
      yieldPercent: "35%"
    }));
    const afterUnderstanding = compileUnderstanding(createSource({
      catalyst: "Pd(dppf)Cl2",
      yieldPercent: "72%"
    }));

    const records = buildTrainingMemoryRecords({
      beforeRevisionId: "rev-before",
      afterRevisionId: "rev-after",
      beforeUnderstanding,
      afterUnderstanding
    });

    expect(records.semanticDiff).toMatchObject({
      semanticDiffId: "semantic-diff::rev-before::rev-after",
      beforeRevisionId: "rev-before",
      afterRevisionId: "rev-after"
    });
    expect(records.semanticDiff.diff.changed_variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "catalyst",
          before: "Pd(PPh3)4",
          after: "Pd(dppf)Cl2"
        })
      ])
    );
    expect(records.semanticDiff.diff.outcome_delta).toMatchObject({
      yield_percent: {
        old: 35,
        new: 72,
        delta: 37
      }
    });
    expect(records.trainingExperienceEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["condition_updated", "result_updated"])
    );
    expect(records.correctionPatterns[0]).toMatchObject({
      sourceField: "catalyst",
      oldRole: "Pd(PPh3)4",
      newRole: "Pd(dppf)Cl2",
      supportCount: 1
    });
    expect(records.experimentPatternMemories[0]).toMatchObject({
      reactionFamily: "cross_coupling",
      patternScope: "revision_pair"
    });
    expect(records.datasetProjections[0]).toMatchObject({
      datasetType: "training_task_dataset",
      schemaVersion: "chemd-training-task-dataset/v0.1"
    });
  });

  it("supports initial revisions without a before record", () => {
    const afterUnderstanding = compileUnderstanding(createSource({
      catalyst: "Pd(PPh3)4",
      yieldPercent: "35%"
    }));

    const records = buildTrainingMemoryRecords({
      afterRevisionId: "rev-initial",
      afterUnderstanding
    });

    expect(records.semanticDiff.diff).toMatchObject({
      diff_type: "initial_revision",
      training_uses: expect.arrayContaining(["reaction_classification"])
    });
    expect(records.trainingExperienceEvents.length).toBeGreaterThan(0);
    expect(records.experimentPatternMemories[0]?.supportCount).toBeGreaterThan(0);
  });
});
