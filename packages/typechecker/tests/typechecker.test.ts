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

describe("reaction route graph", () => {
  it("resolves reaction prev links, infers next links, and supports scoped local refs", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-route-local
title: route local
date: 2026-04-24
---

:::chemd #rxn-step-01
kind: reaction
route: route-a
reactants: a
products: b
:::

:::chemd #rxn-step-02
kind: reaction
route: route-a
prev: exp-route-local#rxn-step-01
reactants: b
products: c
:::
`));

    const result = typecheckDocument(document);
    const step1 = result.typedGraph.nodes.find((node) => node.kind === "reaction" && node.nodeId === "rxn-step-01");
    const step2 = result.typedGraph.nodes.find((node) => node.kind === "reaction" && node.nodeId === "rxn-step-02");

    expect(step2).toMatchObject({
      route: "route-a",
      prev: [expect.objectContaining({
        refId: "exp-route-local#rxn-step-01",
        targetKind: "reaction",
        resolved: true
      })]
    });
    expect(step1).toMatchObject({
      next: [expect.objectContaining({
        refId: "rxn-step-02",
        targetKind: "reaction",
        resolved: true
      })]
    });
  });

  it("resolves external prev links and infers external next links when route context is provided", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-route-external
title: route external
date: 2026-04-24
---

:::chemd #rxn-step-02
kind: reaction
route: route-a
prev: route-doc#rxn-step-01
reactants: b
products: c
:::

:::chemd #rxn-step-03
kind: reaction
route: route-a
prev: rxn-step-02
reactants: c
products: d
:::
`));

    const result = typecheckDocument(document, {
      reactionRouteContext: {
        externalReactions: [{
          refId: "route-doc#rxn-step-01",
          routeId: "route-a",
          prevRefIds: []
        }, {
          refId: "route-doc#rxn-step-04",
          routeId: "route-a",
          prevRefIds: ["exp-route-external#rxn-step-03"]
        }]
      }
    });
    const step2 = result.typedGraph.nodes.find((node) => node.kind === "reaction" && node.nodeId === "rxn-step-02");
    const step3 = result.typedGraph.nodes.find((node) => node.kind === "reaction" && node.nodeId === "rxn-step-03");

    expect(step2).toMatchObject({
      prev: [expect.objectContaining({
        refId: "route-doc#rxn-step-01",
        targetKind: "reaction",
        resolved: true
      })]
    });
    expect(step3).toMatchObject({
      next: [expect.objectContaining({
        refId: "route-doc#rxn-step-04",
        targetKind: "reaction",
        resolved: true
      })]
    });
  });

  it("emits route diagnostics for cycle and orphan steps", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-route-diagnostics
title: route diagnostics
date: 2026-04-24
---

:::chemd #rxn-a
kind: reaction
route: route-c
prev: rxn-b
reactants: a
products: b
:::

:::chemd #rxn-b
kind: reaction
route: route-c
prev: rxn-a
reactants: b
products: c
:::

:::chemd #rxn-orphan
kind: reaction
route: route-c
reactants: x
products: y
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_REACTION_ROUTE_CYCLE",
        sourceNodeId: expect.stringMatching(/rxn-[ab]/)
      }),
      expect.objectContaining({
        code: "W_REACTION_ROUTE_ORPHAN",
        sourceNodeId: "rxn-orphan"
      })
    ]));
  });
});

describe("typed artifacts and sample lineage", () => {
  it("adds artifact nodes and resolves sample lineage references", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-artifact-typed
title: typed artifacts
date: 2026-04-23
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
:::

:::sample #sample-parent
name: parent batch
:::

:::sample #sample-child
derived_from: rxn-main
aliquot_of: sample-parent
batch_of: sample-parent
artifacts: spec-main
:::

:::artifact #spec-main
kind: nmr_spectrum
ref: sample-child
path: data/spec-main.pdf
:::
`));

    const result = typecheckDocument(document);
    const sample = result.typedGraph.nodes.find((node) =>
      node.kind === "sample" && node.nodeId === "sample-child"
    );
    const artifact = result.typedGraph.nodes.find((node) => node.kind === "artifact");

    expect(sample).toMatchObject({
      kind: "sample",
      derivedFrom: expect.objectContaining({
        kind: "reference",
        refId: "rxn-main",
        targetKind: "reaction",
        resolved: true
      }),
      aliquotOf: expect.objectContaining({
        refId: "sample-parent",
        targetKind: "sample",
        resolved: true
      }),
      batchOf: expect.objectContaining({
        refId: "sample-parent",
        targetKind: "sample",
        resolved: true
      }),
      artifacts: [
        expect.objectContaining({
          refId: "spec-main",
          targetKind: "artifact",
          resolved: true
        })
      ]
    });
    expect(artifact).toMatchObject({
      kind: "artifact",
      nodeId: "spec-main",
      artifactKind: "nmr_spectrum",
      path: "data/spec-main.pdf"
    });
  });

  it("diagnoses sample lineage fields that target non-sample entities", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-lineage-mismatch
title: typed lineage mismatch
date: 2026-04-23
---

:::chemd #rxn-main
kind: reaction
reactants: a
products: b
:::

:::sample #sample-child
aliquot_of: rxn-main
batch_of: rxn-main
:::
`));

    const result = typecheckDocument(document);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "E_TYPED_REFERENCE_MISMATCH",
        sourceField: "aliquot_of",
        facts: expect.objectContaining({
          expected_target_kind: "sample",
          actual_target_kind: "reaction"
        })
      }),
      expect.objectContaining({
        code: "E_TYPED_REFERENCE_MISMATCH",
        sourceField: "batch_of",
        facts: expect.objectContaining({
          expected_target_kind: "sample",
          actual_target_kind: "reaction"
        })
      })
    ]));
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
