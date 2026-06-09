import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";
import { parseChemdProgram } from "@chemd/parser";
import { describe, expect, it } from "vitest";

import { applyAuthoringSuggestion, applyAuthoringTemplate } from "../src/index";
import { buildAuthoringAssistance } from "../src/authoring-assistance";

const semanticLayer = (input: Record<string, unknown>): ChemdTrainingExportV2 =>
  ({
    source_layer: { declarations: [] },
    semantic_layer: {
      molecules: [],
      materials: [],
      batches: [],
      reactions: [],
      results: [],
      analyses: [],
      samples: [],
      artifacts: [],
      condition_variations: [],
      condition_variation_attempts: [],
      documentation_blocks: [],
      procedures: [],
      links: [],
      ...input
    }
  }) as unknown as ChemdTrainingExportV2;

describe("authoring assistance", () => {
  it("builds conservative program declaration ref suggestions", () => {
    const source = `module exp_authoring_basic

meta {
  id: "exp-authoring-basic"
  title: "Authoring basic"
  date: "2026-05-29"
}

reaction rxn_main {
  reactants: [substrate]
  products: [product]
}

result res_main {
  status: success
  yield: 72%
}

analysis ana_main {
  type: tlc
  notes: "one major spot"
}

procedure proc_main {
  step stir = stir(duration: 2 h)
}

observation obs_main {
  notes: "Dark red solution formed."
}
`;
    const assistance = buildAuthoringAssistance(parseChemdProgram(source), semanticLayer({
      reactions: [{ original_id: "rxn_main", entity_id: "reaction::rxn_main", products: [{ raw: "product" }] }],
      results: [{ original_id: "res_main", entity_id: "result::res_main" }],
      analyses: [{ original_id: "ana_main", entity_id: "analysis::ana_main" }]
    }));

    expect(assistance.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ suggestion_id: "suggest-primary-reaction-rxn_main" }),
      expect.objectContaining({ suggestion_id: "suggest-result-ref-res_main" }),
      expect.objectContaining({ suggestion_id: "suggest-analysis-ref-ana_main" }),
      expect.objectContaining({ suggestion_id: "suggest-procedure-ref-proc_main" }),
      expect.objectContaining({ suggestion_id: "suggest-observation-ref-obs_main" })
    ]));
    expect(assistance.minimal_sets).toContainEqual(expect.objectContaining({
      checklist_id: "linked-supporting-declarations",
      status: "fixable_by_suggestion"
    }));

    const suggestion = assistance.suggestions.find((item) =>
      item.suggestion_id === "suggest-analysis-ref-ana_main"
    );

    expect(applyAuthoringSuggestion(source, suggestion!)).toContain(`analysis ana_main {
  type: tlc
  ref: rxn_main
  notes: "one major spot"
}`);
  });

  it("offers program starter templates and applies them through patch helper", () => {
    const source = `module exp_authoring_empty

meta {
  id: "exp-authoring-empty"
  title: "Empty authoring doc"
  date: "2026-05-29"
}
`;
    const assistance = buildAuthoringAssistance(parseChemdProgram(source), semanticLayer({}));
    const template = assistance.templates.find((item) =>
      item.template_id === "starter-reaction-result"
    );

    expect(template).toMatchObject({ category: "starter" });
expect(applyAuthoringTemplate(source, template!)).toContain(`reaction rxn-main {
  reactants: [substrate]
  products: [product]
  solvent: ["THF"]
}`);
  });

  it("targets condition_screen declarations for standard and attempt result fixes", () => {
    const source = `module exp_authoring_condition

meta {
  id: "exp-authoring-condition"
  title: "Authoring condition"
  date: "2026-05-29"
}

reaction rxn_standard {
  solvent: "THF"
}

reaction rxn_var1 {
  solvent: "MeCN"
}

condition_screen cv_screen {
  attempt: var1
  reaction: @rxn_var1
}
`;
    const assistance = buildAuthoringAssistance(parseChemdProgram(source), semanticLayer({
      reactions: [
        { original_id: "rxn_standard", entity_id: "reaction::rxn_standard", solvent_raw: "THF", products: [] },
        { original_id: "rxn_var1", entity_id: "reaction::rxn_var1", solvent_raw: "MeCN", products: [] }
      ],
      results: [{ original_id: "res_var1", entity_id: "result::res_var1", ref_raw: "rxn_var1" }],
      condition_variations: [{ original_id: "cv_screen", entity_id: "condition::cv_screen" }],
      condition_variation_attempts: [{
        original_id: "cv_screen.var1",
        attempt_id: "var1",
        parent_condition_variation_id: "condition::cv_screen",
        reaction_ref_raw: "rxn_var1"
      }]
    }));

    expect(assistance.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ suggestion_id: "suggest-condition-standard-cv_screen" }),
      expect.objectContaining({ suggestion_id: "suggest-condition-result-cv_screen.var1" })
    ]));

    const standard = assistance.suggestions.find((item) =>
      item.suggestion_id === "suggest-condition-standard-cv_screen"
    );

    const patchedSource = applyAuthoringSuggestion(source, standard!);

    expect(patchedSource).toContain("condition_screen cv_screen {");
    expect(patchedSource).toContain("standard: @rxn_standard");
  });
});
