import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("nested explicit step and event blocks", () => {
  it("typechecks nested procedure steps and observation events", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-nested-typed
title: nested typed events
date: 2026-04-18
---

:::procedure #proc-main
:::step s-heat
family: heat
temperature: 65 C
duration: 4 h
:::
:::

:::observation #obs-main
:::event e-color
type: color_change
color: yellow
linkedStep: s-heat
:::
:::
`));

    const result = typecheckDocument(document);

    expect(result.stepGraph.steps[0]).toMatchObject({
      stepId: "s-heat",
      family: "heat",
      params: {
        temperature: expect.objectContaining({
          kind: "quantity",
          canonicalValue: 65,
          sourceNodeId: "s-heat"
        })
      },
      source: {
        sourceType: "explicit_step"
      }
    });
    expect(result.stepGraph.observations[0]?.events[0]).toMatchObject({
      eventId: "e-color",
      eventType: "color_change",
      linkedStepId: "s-heat",
      source: {
        sourceType: "explicit_observation"
      }
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "E_OBSERVATION_LINKED_STEP_MISSING"
    );
  });
});
