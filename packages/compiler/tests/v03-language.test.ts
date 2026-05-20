import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

const source = `---
id: exp-v03
title: v0.3 internal language smoke
date: 2026-04-17
primary_reaction: rxn-main
primary_result: res-main
---

:::chemd #rxn-main
kind: reaction
reactants: substrate_1 | reagent_2
products: product_1
solvent: THF
temperature: -78 °C
time: 30 min
atmosphere: nitrogen
:::

:::procedure #proc-main
1. 将底物溶于 THF，冷却至 -78 °C。
2. 在氮气下缓慢滴加 n-BuLi。
3. 反应 30 min 后取样做 TLC。
:::

:::observation #obs-main
加入 n-BuLi 后体系逐渐变深红色。
:::

:::analysis #ana-tlc
type: tlc
ref: rxn-main
result: partial_conversion
data: TLC shows starting material remains
:::

:::result #res-main
status: partial
yield: 23%
purity: 91%
:::

:::sample #sample-main
derived_from: rxn-main
artifacts: spec-main
:::

:::artifact #spec-main
kind: tlc_image
ref: res-main
path: data/tlc/spec-main.png
:::
`;

const goldenSource = readFileSync(
  new URL("../fixtures/golden-experiment-record.chemd", import.meta.url),
  "utf8"
);
const totalSynthesisSource = readFileSync(
  new URL("../fixtures/best-practice-total-synthesis.chemd", import.meta.url),
  "utf8"
);
const oneStepSynthesisSource = readFileSync(
  new URL("../fixtures/best-practice-one-step-synthesis.chemd", import.meta.url),
  "utf8"
);
const conditionScreenSource = readFileSync(
  new URL("../fixtures/best-practice-condition-screen.chemd", import.meta.url),
  "utf8"
);

describe("chemd-lang v0.3 compiler integration", () => {
  it("keeps the author surface intact and exposes semantic artifacts", () => {
    const result = compileChemd(source);

    expect(result.document.children.some((node) => node.type === "procedure")).toBe(true);
    expect(result.html).toContain("v0.3 internal language smoke");
    expect(result.typedSemanticGraph.nodes.some((node) => node.kind === "reaction")).toBe(true);
    expect(result.stepGraph.steps.map((step) => step.family)).toEqual([
      "charge",
      "cool",
      "add",
      "hold",
      "sample",
      "analyze"
    ]);
    expect(result.runtimePreflight.blocking).toBe(false);
    expect(result.lnf.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(result.lnf.experiment.workflow.steps.map((step) => step.family)).toContain("cool");
    expect(result.lnf.experiment.workflow.stepSources.loweredStepIds.length).toBeGreaterThan(0);
    expect(result.trainingExport.schema_version).toBe("chemd-training-export/v0.2");
    expect(result.trainingExport.semantic_layer.lnf?.schemaVersion).toBe("chemd-lnf/v0.5");
    expect(result.trainingExport.semantic_layer.artifacts[0]).toMatchObject({
      original_id: "spec-main",
      artifact_kind: "tlc_image",
      path: "data/tlc/spec-main.png"
    });
    expect(result.trainingUnderstanding.entities.artifacts[0]).toMatchObject({
      artifact_kind: "tlc_image"
    });
    expect(result.trainingUnderstanding.experiment_logic.evidence_links).toContainEqual(
      expect.objectContaining({ relation_type: "artifact_supports_result" })
    );
    expect(result.trainingExport.learning_layer.retrieval_chunks.length).toBeGreaterThan(0);
    expect(JSON.parse(result.docxBridge)).toMatchObject({
      semantic: {
        typedGraph: {
          documentId: "exp-v03"
        }
      }
    });
  });

  it("compiles the golden record fixture with explicit experiment logic", () => {
    const result = compileChemd(goldenSource);
    const diagnostics = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

    expect(diagnostics).toHaveLength(0);
    expect(result.trainingExport.semantic_layer.condition_variations[0]).toMatchObject({
      original_id: "cv-coupling-screen",
      standard_ref_raw: "rxn-standard",
      attempt_entity_ids: expect.arrayContaining([
        "cva::exp-golden-suzuki-screen::cv-coupling-screen.var1",
        "cva::exp-golden-suzuki-screen::cv-coupling-screen.var2"
      ])
    });
    expect(result.trainingExport.semantic_layer.condition_variation_attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          original_id: "cv-coupling-screen.var1",
          reaction_ref_raw: "rxn-var1",
          result_ref_raw: "res-var1"
        }),
        expect.objectContaining({
          original_id: "cv-coupling-screen.var2",
          reaction_ref_raw: "rxn-var2",
          result_ref_raw: "res-var2"
        })
      ])
    );
    expect(result.trainingExport.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "analysis_targets_condition_variation_attempt",
        from_entity_id: "ana::exp-golden-suzuki-screen::ana-tlc-var1",
        to_entity_id: "cva::exp-golden-suzuki-screen::cv-coupling-screen.var1"
      }),
      expect.objectContaining({
        relation_type: "condition_variation_attempt_has_result",
        from_entity_id: "cva::exp-golden-suzuki-screen::cv-coupling-screen.var1",
        to_entity_id: "res::exp-golden-suzuki-screen::res-var1"
      }),
      expect.objectContaining({
        relation_type: "sample_aliquot_of_sample",
        from_entity_id: "sam::exp-golden-suzuki-screen::sample-aliquot-var1",
        to_entity_id: "sam::exp-golden-suzuki-screen::sample-batch-var1"
      }),
      expect.objectContaining({
        relation_type: "artifact_supports_result",
        from_entity_id: "art::exp-golden-suzuki-screen::art-nmr-var1",
        to_entity_id: "res::exp-golden-suzuki-screen::res-var1"
      })
    ]));
    expect(result.trainingUnderstanding.experiment_logic.material_flow_graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edge_type: "step_produces_material",
        from_node_id: "step::exp-golden-suzuki-screen::proc-var1::s-sample-var1",
        to_node_id: "sam::exp-golden-suzuki-screen::sample-aliquot-var1"
      }),
      expect.objectContaining({
        edge_type: "sample_has_artifact",
        from_node_id: "sam::exp-golden-suzuki-screen::sample-purified-var1",
        to_node_id: "art::exp-golden-suzuki-screen::art-nmr-var1"
      })
    ]));
    expect(result.trainingUnderstanding.procedure_logic.procedure_to_steps[0]?.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: "s-heat-var1",
        family: "heat"
      }),
      expect.objectContaining({
        stepId: "s-analyze-var1",
        family: "analyze"
      })
    ]));
    expect(result.trainingUnderstanding.procedure_logic.observation_to_events[0]?.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventId: "e-color-var1",
          linkedStepId: "s-heat-var1"
        }),
        expect.objectContaining({
          eventId: "e-solid-var1",
          linkedStepId: "s-quench-var1"
        })
      ])
    );
  });

  it("compiles the total synthesis best-practice fixture and infers route edges", () => {
    const result = compileChemd(totalSynthesisSource, {
      reactionRouteContext: {
        externalReactions: [{
          refId: "report-step-08#rxn-step-08",
          routeId: "route-taxol-a",
          prevRefIds: ["exp-total-synthesis-step-07#rxn-step-07"]
        }]
      }
    });
    const diagnostics = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
    const step = result.typedSemanticGraph.nodes.find((node) =>
      node.kind === "reaction" && node.nodeId === "rxn-step-07"
    );

    expect(diagnostics).toHaveLength(0);
    expect(step).toMatchObject({
      route: "route-taxol-a",
      prev: [expect.objectContaining({
        refId: "rxn-step-06",
        targetKind: "reaction",
        resolved: true
      })],
      next: [expect.objectContaining({
        refId: "report-step-08#rxn-step-08",
        targetKind: "reaction",
        resolved: true
      })]
    });
    expect(result.trainingExport.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "reaction_depends_on_reaction",
        from_entity_id: "rxn::exp-total-synthesis-step-07::rxn-step-07",
        to_entity_id: "rxn::exp-total-synthesis-step-07::rxn-step-06"
      }),
      expect.objectContaining({
        relation_type: "reaction_precedes_reaction",
        from_entity_id: "rxn::exp-total-synthesis-step-07::rxn-step-07",
        to_entity_id: "rxn::report-step-08::rxn-step-08"
      })
    ]));
    expect(result.diagnostics).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "W_AUTHORING_INPUT_REQUIRED"
      })
    ]));
  });

  it("compiles the one-step synthesis best-practice fixture", () => {
    const result = compileChemd(oneStepSynthesisSource);
    const diagnostics = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

    expect(diagnostics).toHaveLength(0);
    expect(result.trainingExport.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "artifact_supports_result",
        from_entity_id: "art::exp-one-step-esterification::art-nmr-main",
        to_entity_id: "res::exp-one-step-esterification::res-main"
      })
    ]));
    expect(result.trainingUnderstanding.procedure_logic.procedure_to_steps[0]?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: "s-heat",
          family: "heat"
        }),
        expect.objectContaining({
          stepId: "s-purify",
          family: "purify"
        })
      ])
    );
  });

  it("compiles the condition screen best-practice fixture", () => {
    const result = compileChemd(conditionScreenSource);
    const diagnostics = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");

    expect(diagnostics).toHaveLength(0);
    expect(result.trainingExport.semantic_layer.condition_variations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        original_id: "cv-screen",
        standard_ref_raw: "rxn-standard",
        attempt_entity_ids: expect.arrayContaining([
          "cva::exp-condition-screen::cv-screen.var1",
          "cva::exp-condition-screen::cv-screen.var2"
        ])
      })
    ]));
    expect(result.trainingExport.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "analysis_targets_condition_variation_attempt",
        from_entity_id: "ana::exp-condition-screen::ana-tlc-var1",
        to_entity_id: "cva::exp-condition-screen::cv-screen.var1"
      }),
      expect.objectContaining({
        relation_type: "condition_variation_attempt_has_result",
        from_entity_id: "cva::exp-condition-screen::cv-screen.var1",
        to_entity_id: "res::exp-condition-screen::res-var1"
      })
    ]));
  });
});
