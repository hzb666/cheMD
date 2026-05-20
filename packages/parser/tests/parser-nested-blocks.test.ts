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

  it("parses brace-based procedure controls and trace event lines", () => {
    const document = parseChemd(`---
id: exp-control-trace
title: Control trace
date: 2026-05-20
---

:::procedure #proc-main
step: charge | id=s-charge | inputs=@substrate
repeat: wash-cycle | count=2 {
  step: wash | solvent=brine | volume=10 mL
}
wait: operator-approval | condition=operator.confirmed | timeout=30 min
:::

:::trace #run-main
plan: @proc-main
mode: human-run
event: run_started | at=2026-05-20T10:00:00Z
event: step_started | step=s-charge | at=2026-05-20T10:01:00Z
event: observation_recorded | step=s-charge | text="clear solution"
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      controls: [
        expect.objectContaining({
          type: "control",
          kind: "repeat",
          controlId: "wash-cycle",
          params: { count: "2" },
          children: [expect.objectContaining({ type: "step", family: "wash" })]
        }),
        expect.objectContaining({
          type: "control",
          kind: "wait",
          controlId: "operator-approval",
          params: { condition: "operator.confirmed", timeout: "30 min" }
        })
      ]
    });
    expect(document.children[1]).toMatchObject({
      type: "trace",
      id: "run-main",
      plan: "@proc-main",
      mode: "human-run",
      events: [
        expect.objectContaining({ eventType: "run_started", at: "2026-05-20T10:00:00Z" }),
        expect.objectContaining({ eventType: "step_started", stepId: "s-charge" }),
        expect.objectContaining({ eventType: "observation_recorded", params: { text: "clear solution" } })
      ]
    });
  });
});
