import { describe, expect, it } from "vitest";

import {
  applyAuthoringSuggestion,
  applyAuthoringTemplate,
  compileChemd
} from "../src/index";

describe("authoring assistance", () => {
  it("builds conservative ref suggestions for uniquely targetable blocks", () => {
    const source = `---
id: exp-authoring-basic
title: Authoring basic
date: 2026-04-23
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
solvent: THF
:::

:::result #res-main
status: success
yield: 72%
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::

:::procedure #proc-main
1. Stir 2 h.
:::

:::observation #obs-main
Dark red solution formed.
:::
`;
    const result = compileChemd(source);
    const assistance = result.authoringAssistance;

    expect(assistance.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ suggestion_id: "suggest-result-ref-res-main" }),
      expect.objectContaining({ suggestion_id: "suggest-analysis-ref-ana-main" }),
      expect.objectContaining({ suggestion_id: "suggest-procedure-ref-proc-main" }),
      expect.objectContaining({ suggestion_id: "suggest-observation-ref-obs-main" })
    ]));
    expect(assistance.minimal_sets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        checklist_id: "basic-experiment-record",
        status: "fixable_by_suggestion",
        inferable_items: expect.arrayContaining(["res-main.ref"])
      }),
      expect.objectContaining({
        checklist_id: "linked-supporting-blocks",
        status: "fixable_by_suggestion"
      })
    ]));

    const analysisRefSuggestion = assistance.suggestions.find(
      (item) => item.suggestion_id === "suggest-analysis-ref-ana-main"
    );

    expect(analysisRefSuggestion).toBeDefined();

    const nextSource = applyAuthoringSuggestion(
      source,
      analysisRefSuggestion as NonNullable<typeof analysisRefSuggestion>
    );

    expect(nextSource).toContain(`:::analysis #ana-main
type: tlc
ref: rxn-main`);
  });

  it("suggests inherited baseline fields and attempt result pairing for condition screens", () => {
    const source = `---
id: exp-authoring-conditions
title: Authoring condition screen
date: 2026-04-23
primary_reaction: rxn-standard
---

:::chemd #rxn-standard
kind: reaction
reactants: substrate
products: product
solvent: THF
temperature: 25 C
catalyst: Pd
:::

:::chemd #rxn-var1
kind: reaction
reactants: substrate
products: product
solvent: MeCN
temperature: 40 C
catalyst: Pd
:::

:::result #res-var1
ref: rxn-var1
status: success
yield: 81%
:::

:::condition-varies #cv-screen
standard: rxn-standard
varies: solvent | temperature
var1: reaction=rxn-var1 | solvent=MeCN | temperature=40 C
:::
`;
    const result = compileChemd(source);
    const assistance = result.authoringAssistance;

    expect(assistance.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ suggestion_id: "suggest-condition-baseline-cv-screen" }),
      expect.objectContaining({ suggestion_id: "suggest-condition-result-cv-screen.var1" })
    ]));
    expect(assistance.minimal_sets).toContainEqual(expect.objectContaining({
      checklist_id: "condition-optimization",
      status: "fixable_by_suggestion",
      inferable_items: expect.arrayContaining(["cv-screen.condition"])
    }));
  });

  it("offers starter templates and can apply them through the shared patch helper", () => {
    const source = `---
id: exp-authoring-empty
title: Empty authoring doc
date: 2026-04-23
---
`;
    const result = compileChemd(source);
    const template = result.authoringAssistance.templates.find((item) =>
      item.template_id === "starter-reaction-result"
    );

    expect(template).toMatchObject({
      title: "插入 Reaction + Result 模板"
    });

    expect(template).toBeDefined();

    const nextSource = applyAuthoringTemplate(
      source,
      template as NonNullable<typeof template>
    );

    expect(nextSource).toContain(":::chemd #rxn-main");
    expect(nextSource).toContain(":::result #res-main");
    expect(nextSource).toContain("ref: rxn-main");
  });
});
