import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd nested procedure and observation blocks", () => {
  it("parses nested step blocks inside procedure blocks", () => {
    const document = parseChemd(`---
id: exp-nested-steps
title: Nested steps
date: 2026-04-18
---

:::procedure #proc-main
ref: rxn-main
:::step s-charge
family: charge
inputs: @substrate, @base
vessel: reactor_1
:::
Mix until homogeneous.
:::step #s-heat
family: heat
temperature: 65 C
duration: 4 h
dependsOn: s-charge
outputs: product
:::
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      id: "proc-main",
      ref: "rxn-main",
      body: "Mix until homogeneous.",
      children: [
        { type: "step", stepId: "s-charge" },
        { type: "markdown", value: "Mix until homogeneous." },
        { type: "step", stepId: "s-heat" }
      ],
      steps: [
        {
          type: "step",
          stepId: "s-charge",
          family: "charge",
          inputs: ["@substrate", "@base"],
          params: { vessel: "reactor_1" },
          authorProvided: true
        },
        {
          type: "step",
          stepId: "s-heat",
          family: "heat",
          params: { temperature: "65 C", duration: "4 h" },
          dependsOn: ["s-charge"],
          outputs: ["product"],
          authorProvided: true
        }
      ]
    });
  });

  it("parses nested event blocks inside observation blocks", () => {
    const document = parseChemd(`---
id: exp-nested-events
title: Nested events
date: 2026-04-18
---

:::observation #obs-main
ref: rxn-main
:::event e-color
type: color_change
color: yellow
linkedStep: s-heat
:::
The mixture stayed clear after workup.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "observation",
      id: "obs-main",
      ref: "rxn-main",
      body: "The mixture stayed clear after workup.",
      children: [
        { type: "event", eventId: "e-color" },
        { type: "markdown", value: "The mixture stayed clear after workup." }
      ],
      events: [
        {
          type: "event",
          eventId: "e-color",
          eventType: "color_change",
          linkedStepId: "s-heat",
          params: { color: "yellow" },
          authorProvided: true
        }
      ]
    });
  });
});
