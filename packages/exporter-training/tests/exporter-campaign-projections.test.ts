import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildTrainingCampaignFromUnderstandings,
  buildTrainingCampaignTaskDataset,
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

const buildUnderstanding = (source: string, exportedAt: string) => {
  const document = resolveChemd(parseChemd(source));
  const checked = typecheckDocument(document);
  const record = exportTrainingRecordFromDocument(document, {
    typedGraph: checked.typedGraph,
    stepGraph: checked.stepGraph,
    exportedAt
  });

  return buildTrainingUnderstandingFromRecord(record);
};

describe("training export campaign projections", () => {
  it("builds cross-document optimization trajectories and strategy datasets", () => {
    const sourceA = `---
id: exp-campaign-a
title: Campaign A
date: 2026-04-21
---

:::chemd #rxn-a
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
yield: 35%
:::

:::result #res-a
ref: rxn-a
status: partial
yield: 35%
:::
`;
    const sourceB = `---
id: exp-campaign-b
title: Campaign B
date: 2026-04-23
---

:::chemd #rxn-b
kind: reaction
reactants: substrate
products: product
solvent: MeCN
temperature: 25 C
yield: 68%
:::

:::result #res-b
ref: rxn-b
status: success
yield: 68%
:::
`;

    const understandingA = buildUnderstanding(sourceA, "2026-04-21T00:00:00.000Z");
    const understandingB = buildUnderstanding(sourceB, "2026-04-23T00:00:00.000Z");
    const campaign = buildTrainingCampaignFromUnderstandings([understandingA, understandingB]);
    const dataset = buildTrainingCampaignTaskDataset([understandingA, understandingB]);

    expect(campaign.trajectories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        document_ids: ["exp-campaign-a", "exp-campaign-b"],
        strategy_labels: expect.arrayContaining(["single_factor_optimization"])
      })
    ]));
    expect(dataset.examples[0]).toMatchObject({
      task_type: "cross_document_strategy",
      source_document_ids: ["exp-campaign-a", "exp-campaign-b"]
    });
    expect(JSON.parse(dataset.examples[0]?.messages[1]?.content ?? "{}")).toMatchObject({
      task: "cross_document_strategy",
      runs: expect.arrayContaining([
        expect.objectContaining({ document_id: "exp-campaign-a" }),
        expect.objectContaining({ document_id: "exp-campaign-b" })
      ])
    });
  });
});
