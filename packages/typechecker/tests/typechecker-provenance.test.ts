import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("typechecker provenance propagation", () => {
  it("keeps explicit step and event provenance in the step graph", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-provenance-graph
title: Provenance graph
date: 2026-04-18
---

:::procedure #proc-main
step: heat | id=s-heat | temperature=65 C
:::

:::observation #obs-main
event: color_change | id=e-color | color=yellow | linkedStep=s-heat
:::
`));

    const result = typecheckDocument(document);

    expect(result.stepGraph.steps[0]).toMatchObject({
      stepId: "s-heat",
      source: {
        sourceSpan: {
          startLine: 1,
          endLine: 1
        },
        provenance: {
          origin: "author",
          sourceField: "step"
        }
      },
      provenance: {
        origin: "author",
        sourceNodeId: "s-heat"
      }
    });
    expect(result.stepGraph.observations[0]?.events[0]).toMatchObject({
      eventId: "e-color",
      source: {
        sourceSpan: {
          startLine: 1,
          endLine: 1
        },
        provenance: {
          origin: "author",
          sourceField: "event"
        }
      },
      provenance: {
        origin: "author",
        sourceNodeId: "e-color"
      }
    });
  });
});
