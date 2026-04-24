import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd author provenance", () => {
  it("assigns ids, source spans, and provenance to author-provided steps", () => {
    const document = parseChemd(`---
id: exp-step-provenance
title: Step provenance
date: 2026-04-18
---

:::procedure #proc-main
step: charge | inputs=@substrate
:::step #s-heat
family: heat
temperature: 65 C
:::
:::
`);
    const procedure = document.children[0];

    expect(procedure).toMatchObject({
      type: "procedure",
      steps: [
        {
          stepId: "proc-main:s1",
          sourceSpan: {
            startLine: 1,
            endLine: 1
          },
          provenance: {
            origin: "author",
            sourceNodeType: "step",
            sourceNodeId: "proc-main:s1",
            sourceField: "step",
            ruleId: "parser.author.step",
            confidence: 1
          }
        },
        {
          stepId: "s-heat",
          sourceSpan: {
            startLine: 2,
            endLine: 5
          },
          provenance: {
            origin: "author",
            sourceNodeType: "step",
            sourceNodeId: "s-heat",
            sourceField: "step",
            ruleId: "parser.author.step",
            confidence: 1
          }
        }
      ]
    });
  });

  it("assigns ids, source spans, and provenance to author-provided events", () => {
    const document = parseChemd(`---
id: exp-event-provenance
title: Event provenance
date: 2026-04-18
---

:::observation #obs-main
event: color_change | color=yellow
:::event #e-solid
type: precipitation
state: solid
:::
:::
`);
    const observation = document.children[0];

    expect(observation).toMatchObject({
      type: "observation",
      events: [
        {
          eventId: "obs-main:e1",
          sourceSpan: {
            startLine: 1,
            endLine: 1
          },
          provenance: {
            origin: "author",
            sourceNodeType: "event",
            sourceNodeId: "obs-main:e1",
            sourceField: "event",
            ruleId: "parser.author.event",
            confidence: 1
          }
        },
        {
          eventId: "e-solid",
          sourceSpan: {
            startLine: 2,
            endLine: 5
          },
          provenance: {
            origin: "author",
            sourceNodeType: "event",
            sourceNodeId: "e-solid",
            sourceField: "event",
            ruleId: "parser.author.event",
            confidence: 1
          }
        }
      ]
    });
  });
});
