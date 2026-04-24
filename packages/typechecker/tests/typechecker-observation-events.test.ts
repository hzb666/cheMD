import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("explicit observation events", () => {
  it("uses explicit observation events before prose lowering", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-explicit-events
title: explicit observation events
date: 2026-04-18
---

:::procedure #proc-explicit
step: heat | id=s-heat | temperature=65 C
:::

:::observation #obs-explicit
event: color_change | id=e-color | color=yellow | linkedStep=s-heat
This prose should stay narrative and not create a lowered observation event.
:::
`));

    const result = typecheckDocument(document);
    const event = result.stepGraph.observations[0]?.events[0];

    expect(event).toMatchObject({
      eventId: "e-color",
      eventType: "color_change",
      linkedStepId: "s-heat",
      normalizedValue: "yellow",
      source: {
        sourceType: "explicit_observation",
        sourceNodeId: "obs-explicit"
      },
      confidence: 1
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("W806");
  });

  it("reports observation events linked to missing steps", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-event-link
title: explicit event link
date: 2026-04-18
---

:::observation #obs-explicit
event: precipitation | id=e-solid | linkedStep=s-missing
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_OBSERVATION_LINKED_STEP_MISSING",
        sourceNodeId: "e-solid",
        facts: expect.objectContaining({ linked_step_id: "s-missing" })
      })
    );
  });
});
