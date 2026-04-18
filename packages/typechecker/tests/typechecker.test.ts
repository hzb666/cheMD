import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";

import { typecheckDocument } from "../src/index";

describe("typed semantic graph", () => {
  it("builds typed nodes and a step graph from a resolved document", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-typed
title: typed test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a | b
products: c
temperature: 100 °C
time: 16 h
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 氮气置换 15 min。
2. 加热到 100 °C 反应 16 h。
:::

:::result #res-main
status: partial
yield: 23%
:::
`));

    const result = typecheckDocument(document);

    expect(result.typedGraph.nodes.some((node) => node.kind === "reaction")).toBe(true);
    expect(result.typedGraph.nodes.some((node) => node.kind === "step")).toBe(true);
    expect(result.stepGraph.steps.map((step) => step.family)).toContain("purge");
    expect(result.typedGraph.quantities.some((quantity) => quantity.canonicalUnit === "C")).toBe(true);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("W_PROCEDURE_PROSE_LOWERED");
  });

  it("emits quantity and status diagnostics while preserving raw values", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-bad
title: bad typed test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a
products: b
temperature: overnight
:::

:::result #res-main
status: excellent
yield: THF
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["E403", "E306"])
    );
    expect(result.typedGraph.quantities.some((quantity) => quantity.raw === "overnight")).toBe(true);
  });
});

describe("explicit procedure steps", () => {
  it("uses explicit procedure steps before prose lowering", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-explicit-steps
title: explicit steps
date: 2026-04-17
---

:::procedure #proc-explicit
step: add | materials=n-BuLi | inputs=@substrate | outputs=intermediate
step: analyze | type=tlc
This prose should stay narrative and not create additional lowered steps.
:::
`));

    const result = typecheckDocument(document);

    expect(result.stepGraph.steps.map((step) => step.family)).toEqual(["add", "analyze"]);
    expect(result.stepGraph.steps.every((step) => step.source.sourceType === "explicit_step")).toBe(true);
    expect(result.stepGraph.procedures[0]).toMatchObject({
      procedureId: "proc-explicit",
      sourceType: "explicit_steps",
      loweringConfidence: 1
    });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain("W805");
  });
});

describe("typed semantic graph normalization", () => {
  it("keeps molecule CAS separate from SMILES in typed graph", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-typed-cas
title: typed CAS
date: 2026-04-19
---

:::chemd #mol-cas
kind: molecule
cas: 64-17-5
name: ethanol
:::
`));

    const result = typecheckDocument(document);
    const molecule = result.typedGraph.nodes.find((node) => node.kind === "molecule");

    expect(molecule).toMatchObject({
      kind: "molecule",
      nodeId: "mol-cas",
      cas: "64-17-5",
      name: "ethanol"
    });
    expect(molecule).not.toMatchObject({ smiles: "64-17-5" });
  });

  it("adds normalized reaction conditions and TLC facts to typed nodes", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-normalized
title: normalized semantics
date: 2026-04-17
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
solvent: THF
:::

:::analysis #tlc-main
type: tlc
data: TLC
p1: sm 0.82
:::
`));

    const result = typecheckDocument(document);
    const reaction = result.typedGraph.nodes.find((node) => node.kind === "reaction");
    const analysis = result.typedGraph.nodes.find((node) => node.kind === "analysis");

    expect(reaction).toMatchObject({
      normalizedConditions: {
        solvent: {
          normalized: "tetrahydrofuran"
        }
      }
    });
    expect(analysis).toMatchObject({
      normalizedTlc: {
        lanes: [expect.objectContaining({ lane_role: "starting_material" })]
      }
    });
  });
});

describe("procedure mode and rules", () => {
  it("honors explicit and lowered procedure modes", () => {
    const proseDocument = resolveChemd(parseChemd(`---
id: exp-procedure-mode
title: procedure mode
date: 2026-04-17
---

:::procedure #proc-prose
Heat to 80 C for 2 h.
:::
`));
    const explicitOnly = typecheckDocument(proseDocument, { procedureMode: "explicit" });

    expect(explicitOnly.stepGraph.steps).toHaveLength(0);
    expect(explicitOnly.diagnostics.map((diagnostic) => diagnostic.code)).toContain("E_STEP_MISSING_FIELD");
    expect(explicitOnly.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_STEP_MISSING_FIELD",
        sourceLayer: "typechecker",
        sourceField: "step"
      })
    );

    const explicitDocument = resolveChemd(parseChemd(`---
id: exp-procedure-lowered
title: procedure lowered
date: 2026-04-17
---

:::procedure #proc-explicit
step: add | materials=A
Heat to 80 C for 2 h.
:::
`));
    const loweredOnly = typecheckDocument(explicitDocument, { procedureMode: "lowered" });

    expect(loweredOnly.stepGraph.steps.every((step) => step.source.sourceType === "lowered_step")).toBe(true);
  });

  it("normalizes explicit step quantities and preserves step source ids", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-quantities
title: explicit step quantities
date: 2026-04-18
---

:::procedure #proc-explicit
step: purge | id=s-purge
step: heat | id=s-heat | temperature=65 C | duration=4 h | dependsOn=s-purge
:::
`));

    const result = typecheckDocument(document);
    const heatStep = result.stepGraph.steps.find((step) => step.stepId === "s-heat");

    expect(heatStep).toMatchObject({
      family: "heat",
      params: {
        temperature: expect.objectContaining({
          kind: "quantity",
          quantityClass: "temperature",
          canonicalValue: 65,
          canonicalUnit: "C",
          sourceNodeId: "s-heat",
          sourceField: "temperature"
        }),
        duration: expect.objectContaining({
          kind: "quantity",
          quantityClass: "time",
          canonicalValue: 4,
          canonicalUnit: "h",
          sourceNodeId: "s-heat",
          sourceField: "duration"
        })
      },
      dependsOn: ["s-purge"]
    });
    expect(result.typedGraph.quantities.map((quantity) => quantity.sourceNodeId)).toEqual(
      expect.arrayContaining(["s-heat"])
    );
  });
});

describe("procedure graph and diagnostics", () => {
  it("keeps step artifacts, effects, and observation event params in typed graph", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-event-graph
title: step event graph
date: 2026-04-18
---

:::procedure #proc-graph
Nitrogen purge was performed for 15 min.
:::

:::observation #obs-graph
event: color_change | stage=workup | linkedStepId=proc-graph:s1 | value=yellow
:::
`));

    const result = typecheckDocument(document);
    const purgeStep = result.typedGraph.nodes.find((node) =>
      node.kind === "step" && node.family === "purge"
    );
    const event = result.typedGraph.nodes.find((node) => node.kind === "observation_event");

    expect(purgeStep).toMatchObject({
      effects: expect.arrayContaining(["uses_inert_atmosphere"])
    });
    expect(event).toMatchObject({
      rawText: "event: color_change | stage=workup | linkedStepId=proc-graph:s1 | value=yellow",
      params: expect.objectContaining({ value: "yellow" })
    });
  });

  it("preserves raw derived quantities when expression parsing fails", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-derived-invalid
title: invalid derived quantity
date: 2026-04-18
---

:::result #res-derived
yield: =bad()
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_DERIVED_EXPRESSION_INVALID",
        sourceField: "yield"
      })
    );
    expect(result.typedGraph.quantities).toContainEqual(
      expect.objectContaining({
        raw: "=bad()",
        quantityClass: "percent",
        sourceNodeId: "res-derived",
        sourceField: "yield"
      })
    );
  });

  it("reports explicit step parameter and dependency diagnostics", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-step-diagnostics
title: explicit step diagnostics
date: 2026-04-18
---

:::procedure #proc-explicit
step: heat | id=s-heat
step: analyze | id=s-analyze
step: add | id=s-duplicate | dependsOn=s-cycle
step: mix | id=s-duplicate
step: cool | id=s-cycle | dependsOn=s-cycle
:::
`));

    const result = typecheckDocument(document);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(codes).toEqual(
      expect.arrayContaining([
        "E_STEP_PARAM_MISSING",
        "E_STEP_ID_DUPLICATE",
        "E_STEP_DEPENDENCY_CYCLE"
      ])
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_STEP_PARAM_MISSING",
        sourceNodeId: "s-heat",
        facts: expect.objectContaining({ step_family: "heat" })
      })
    );
  });

});
