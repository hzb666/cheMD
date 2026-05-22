import { describe, expect, it } from "vitest";

import { parseChemd } from "../src/index";

describe("parseChemd", () => {
  it("parses frontmatter and surface-preserving structured blocks", () => {
    const document = parseChemd(`---
id: exp-parser
title: Parser test
date: 2026-04-17
---

:::chemd #rxn-main
reactants: a | b
products: c
:::

:::procedure #proc-main
1. 冷却至 0 °C。
:::
`);

    expect(document.meta.id).toBe("exp-parser");
    expect(document.children.some((node) => node.type === "reaction")).toBe(true);
    expect(document.children.some((node) => node.type === "procedure")).toBe(true);
  });

  it("uses explicit chemd kind before shape inference", () => {
    const document = parseChemd(`---
id: exp-kind
title: Explicit kind
date: 2026-04-17
---

:::chemd #rxn-kind
kind: reaction
reactants: a
products: b
name: explicit reaction
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "reaction",
      id: "rxn-kind",
      declaredKind: "reaction",
      syntaxOrigin: "chemd"
    });
  });

  it("parses reaction route fields on chemd blocks", () => {
    const document = parseChemd(`---
id: exp-route-parse
title: Route parse
date: 2026-04-24
---

:::chemd #rxn-step-07
kind: reaction
route: route-taxol-a
prev: route-doc#rxn-step-06 | rxn-branch-03
reactants: a
products: b
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "reaction",
      id: "rxn-step-07",
      route: "route-taxol-a",
      prev: ["route-doc#rxn-step-06", "rxn-branch-03"]
    });
  });

  it("preserves block field values as raw strings before typechecking", () => {
    const document = parseChemd(`---
id: exp-field-values
title: Field value baseline
date: 2026-05-22
---

:::chemd #rxn-values
kind: reaction
solvent: MeCN ;; temperature: 60 C
reactant: @mol-a | amount=1.0 mmol | equiv=1.0 | limiting=true
reac: @mol-b | 1.2 eq
product: @mol-c
yield: 72%
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "reaction",
      id: "rxn-values",
      solvent: "MeCN",
      temperature: "60 C",
      reactants: [
        "@mol-a | amount=1.0 mmol | equiv=1.0 | limiting=true",
        "@mol-b | 1.2 eq"
      ],
      products: ["@mol-c"],
      yield: "72%"
    });
    expect(document.diagnostics).toEqual([]);
  });

  it("does not report missing chemd kind when inference is stable", () => {
    const document = parseChemd(`---
id: exp-strict-kind
title: Strict kind
date: 2026-04-17
---

:::chemd #mol-implicit
smiles: CCO
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "molecule",
      id: "mol-implicit",
      syntaxOrigin: "chemd"
    });
    expect(document.diagnostics).toEqual([]);
  });

  it("reports conflicts between explicit kind and reaction-shaped fields", () => {
    const document = parseChemd(`---
id: exp-conflict
title: Kind conflict
date: 2026-04-17
---

:::chemd #mol-conflict
kind: molecule
reactants: @a | @b
products: @c
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "molecule",
      id: "mol-conflict",
      declaredKind: "molecule",
      syntaxOrigin: "chemd"
    });
    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_CHEMD_KIND_CONFLICT",
        severity: "error",
        nodeId: "mol-conflict"
      })
    );
  });

  it("treats molecule and reaction blocks as unknown block types", () => {
    const document = parseChemd(`---
id: exp-unknown-blocks
title: Unknown surface blocks
date: 2026-04-17
---

:::molecule #mol-main
smiles: CCO
:::

:::reaction #rxn-main
reactants: @mol-main
products: @product
:::
`);

    expect(document.children).toEqual([]);
    expect(document.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "W_UNKNOWN_BLOCK",
          message: "Unknown block type: molecule",
          sourceNodeType: "molecule",
          sourceNodeId: "mol-main"
        }),
        expect.objectContaining({
          code: "W_UNKNOWN_BLOCK",
          message: "Unknown block type: reaction",
          sourceNodeType: "reaction",
          sourceNodeId: "rxn-main"
        })
      ])
    );
  });

  it("does not report ambiguous kind when the kind field is invalid", () => {
    const document = parseChemd(`---
id: exp-invalid-kind
title: Invalid kind
date: 2026-04-17
---

:::chemd #kind-conflict
kind: compound
smiles: CCO
:::
`);

    expect(document.diagnostics.filter((diagnostic) => diagnostic.code === "E_CHEMD_KIND_CONFLICT")).toHaveLength(1);
    expect(document.diagnostics.some((diagnostic) => diagnostic.code === "W_CHEMD_KIND_AMBIGUOUS")).toBe(false);
    expect(document.children).toEqual([]);
  });

  it("keeps CAS separate from SMILES in molecule nodes", () => {
    const document = parseChemd(`---
id: exp-cas
title: CAS molecule
date: 2026-04-19
---

:::chemd #mol-cas
kind: molecule
cas: 64-17-5
name: ethanol
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "molecule",
      id: "mol-cas",
      cas: "64-17-5",
      name: "ethanol"
    });
    expect(document.children[0]).not.toMatchObject({ smiles: "64-17-5" });
  });

  it("rejects legacy condition-varies flat deltas", () => {
    const document = parseChemd(`---
id: exp-condition-varies
title: Condition varies
date: 2026-04-23
---

:::condition-varies #cv-solvent
reaction: rxn-variant
standard: rxn-standard
solvent: THF -> MeCN
temperature: 25 C -> 40 C
notes: Solvent and temperature screen.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "condition_varies",
      id: "cv-solvent",
      reaction: "rxn-variant",
      standard: "rxn-standard",
      changes: [],
      notes: "Solvent and temperature screen."
    });
    expect(document.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_CONDITION_DSL_FIELD", sourceField: "solvent" }),
      expect.objectContaining({ code: "E_CONDITION_DSL_FIELD", sourceField: "temperature" })
    ]));
  });

  it("parses condition-varies blocks with parallel attempts", () => {
    const document = parseChemd(`---
id: exp-condition-attempts
title: Condition attempts
date: 2026-04-23
---

:::condition-varies #cv-screen
standard: rxn-standard
factor: solvent | baseline=THF
factor: temperature | baseline=25 C
factor: catalyst | baseline=Pd
outcome: yield | baseline=40%
attempt: var1
reaction: rxn-var1
result: res-var1
solvent: MeCN
temperature: 40 C
yield: 78%
note: Higher yield but more impurity.
attempt: var2 | mode=override
reaction: rxn-var2
result: res-var2
solvent: DMSO
temperature: 60 C
catalyst: Ni
yield: 12%
note: Trace product by TLC.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "condition_varies",
      id: "cv-screen",
      standard: "rxn-standard",
      condition: [
        { field: "solvent", baseline: "THF" },
        { field: "temperature", baseline: "25 C" },
        { field: "catalyst", baseline: "Pd" }
      ],
      varyFields: ["solvent", "temperature", "catalyst"],
      attempts: [
        expect.objectContaining({
          id: "var1",
          reaction: "rxn-var1",
          result: "res-var1",
          note: "Higher yield but more impurity.",
          outcomes: { yield: "78%" },
          condition: expect.arrayContaining([
            expect.objectContaining({ field: "catalyst", candidate: "Pd" }),
            expect.objectContaining({ field: "solvent", candidate: "MeCN" })
          ])
        }),
        expect.objectContaining({
          id: "var2",
          mode: "override",
          reaction: "rxn-var2",
          result: "res-var2",
          note: "Trace product by TLC.",
          outcomes: { yield: "12%" },
          condition: expect.arrayContaining([
            expect.objectContaining({ field: "solvent", candidate: "DMSO" })
          ])
        })
      ]
    });
  });

  it("reports ambiguous chemd kind without kind insertion quick fixes", () => {
    const document = parseChemd(`---
id: exp-ambiguous-kind-fix
title: Ambiguous kind quick fix
date: 2026-04-17
---

:::chemd #ambiguous-quick-fix
name: draft
:::
`);

    expect(document.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_CHEMD_KIND_AMBIGUOUS",
        severity: "error"
      })
    );
    expect(document.diagnostics[0]).not.toHaveProperty("quickFixes");
  });

});

describe("parseChemd procedure blocks", () => {
  it("parses procedure reaction links, evidence, and source-mapped step metadata", () => {
    const document = parseChemd(`---
id: exp-procedure-logic
title: Procedure logic
date: 2026-04-23
---

:::procedure #proc-main
reaction: rxn-main
evidence: lab-notebook | run-sheet
step: add | id=s-add | stage=charging | purpose=form intermediate | evidence=notebook,page-2 | confidence=0.9 | inputs=@substrate
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      id: "proc-main",
      reaction: "rxn-main",
      evidence: ["lab-notebook", "run-sheet"],
      fieldSpans: {
        reaction: expect.objectContaining({ startLine: 1 }),
        evidence: expect.objectContaining({ startLine: 2 })
      },
      steps: [
        expect.objectContaining({
          stepId: "s-add",
          stage: "charging",
          purpose: "form intermediate",
          evidence: ["notebook", "page-2"],
          confidence: 0.9,
          sourceSpan: expect.objectContaining({ startLine: 1 })
        })
      ]
    });
  });

  it("parses explicit procedure steps while preserving prose body", () => {
    const document = parseChemd(`---
id: exp-steps
title: Explicit steps
date: 2026-04-17
---

:::procedure #proc-main
ref: rxn-main
step: add | materials=n-BuLi | inputs=@substrate | outputs=intermediate
step: heat | target_temperature=65 C | duration=4 h
Observe color change after heating.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      id: "proc-main",
      ref: "rxn-main",
      body: "Observe color change after heating.",
      steps: [
        {
          family: "add",
          params: { materials: "n-BuLi" },
          inputs: ["@substrate"],
          outputs: ["intermediate"]
        },
        {
          family: "heat",
          params: { target_temperature: "65 C", duration: "4 h" }
        }
      ]
    });
  });

  it("parses explicit procedure step ids and dependency lists", () => {
    const document = parseChemd(`---
id: exp-step-ids
title: Explicit step ids
date: 2026-04-18
---

:::procedure #proc-main
step: charge | id=s-charge | inputs=@substrate,@base
step: heat | id=s-heat | temperature=65 C | duration=4 h | dependsOn=s-charge
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      id: "proc-main",
      steps: [
        {
          stepId: "s-charge",
          family: "charge",
          inputs: ["@substrate", "@base"]
        },
        {
          stepId: "s-heat",
          family: "heat",
          params: { temperature: "65 C", duration: "4 h" },
          dependsOn: ["s-charge"]
        }
      ]
    });
  });

  it("parses nested procedure step blocks", () => {
    const document = parseChemd(`---
id: exp-nested-step
title: Nested step
date: 2026-04-18
---

:::procedure #proc-main
:::step #s-heat
family: heat
temperature: 65 C
duration: 4 h
outputs: intermediate
:::
Check conversion.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "procedure",
      body: "Check conversion.",
      steps: [
        {
          stepId: "s-heat",
          family: "heat",
          params: { temperature: "65 C", duration: "4 h" },
          outputs: ["intermediate"],
          authorProvided: true
        }
      ]
    });
  });
});

describe("parseChemd observation blocks", () => {
  it("parses observation event timepoints, severity, evidence, and confidence", () => {
    const document = parseChemd(`---
id: exp-observation-logic
title: Observation logic
date: 2026-04-23
---

:::observation #obs-main
ref: rxn-main
event: color_change | id=e-color | timepoint=after addition | severity=medium | evidence=photo-1 | confidence=0.8 | linkedStep=s-add
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "observation",
      id: "obs-main",
      fieldSpans: {
        ref: expect.objectContaining({ startLine: 1 })
      },
      events: [
        expect.objectContaining({
          eventId: "e-color",
          timepoint: "after addition",
          severity: "medium",
          evidence: ["photo-1"],
          confidence: 0.8,
          linkedStepId: "s-add",
          sourceSpan: expect.objectContaining({ startLine: 1 })
        })
      ]
    });
  });

  it("parses explicit observation events while preserving prose body", () => {
    const document = parseChemd(`---
id: exp-events
title: Explicit events
date: 2026-04-18
---

:::observation #obs-main
ref: rxn-main
event: color_change | id=e-color | color=yellow | linkedStep=s-heat
The mixture stayed clear after workup.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "observation",
      id: "obs-main",
      ref: "rxn-main",
      body: "The mixture stayed clear after workup.",
      events: [
        {
          eventId: "e-color",
          eventType: "color_change",
          params: { color: "yellow" },
          linkedStepId: "s-heat",
          authorProvided: true
        }
      ]
    });
  });

  it("parses nested observation event blocks", () => {
    const document = parseChemd(`---
id: exp-nested-event
title: Nested event
date: 2026-04-18
---

:::observation #obs-main
:::event #e-color
type: color_change
stage: workup
value: yellow
linkedStep: s-heat
:::
Mixture stayed clear.
:::
`);

    expect(document.children[0]).toMatchObject({
      type: "observation",
      body: "Mixture stayed clear.",
      events: [
        {
          eventId: "e-color",
          eventType: "color_change",
          stage: "workup",
          params: { value: "yellow" },
          linkedStepId: "s-heat",
          authorProvided: true
        }
      ]
    });
  });
});

describe("parseChemd artifacts and sample lineage", () => {
  it("parses artifact blocks, sample artifact references, and chemistry feature refs", () => {
    const document = parseChemd(`---
id: exp-artifact
title: Artifact parsing
date: 2026-04-23
---

:::sample #sample-main
name: final product
derived_from: rxn-main
aliquot_of: crude-main
artifacts: spec-main, photo-main
chemistry_features: fp-sample, fp-extra
:::

:::artifact #spec-main
kind: nmr_spectrum
ref: sample-main
path: data/spec-main.pdf
checksum: sha256:abc
instrument: Bruker 400
chemistry_features: spec-vector, spec-image
:::
`);
    const sample = document.children.find((node) => node.type === "sample");
    const artifact = document.children.find((node) => node.type === "artifact");

    expect(sample).toMatchObject({
      type: "sample",
      id: "sample-main",
      derived_from: "rxn-main",
      aliquot_of: "crude-main",
      artifacts: ["spec-main", "photo-main"],
      chemistryFeatureRefs: [
        { featureId: "fp-sample", kind: "sample", status: "available" },
        { featureId: "fp-extra", kind: "sample", status: "available" }
      ],
      fieldSpans: {
        artifacts: expect.objectContaining({ startLine: 4 })
      }
    });
    expect(artifact).toMatchObject({
      type: "artifact",
      id: "spec-main",
      kind: "nmr_spectrum",
      ref: "sample-main",
      path: "data/spec-main.pdf",
      checksum: "sha256:abc",
      instrument: "Bruker 400",
      chemistryFeatureRefs: [
        { featureId: "spec-vector", kind: "artifact", status: "available" },
        { featureId: "spec-image", kind: "artifact", status: "available" }
      ],
      fieldSpans: {
        path: expect.objectContaining({ startLine: 3 })
      }
    });
  });
});
