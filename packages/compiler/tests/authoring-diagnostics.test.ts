import type { ChemdTrainingExportV2 } from "@chemd/exporter-training";
import { describe, expect, it } from "vitest";

import { buildAuthoringDiagnostics } from "../src/authoring-diagnostics";
import type { AuthoringAssistance } from "../src/index";

const trainingExport = {
  source_layer: { raw_children: [{ node_type: "reaction" }] },
  semantic_layer: {
    reactions: [{ original_id: "rxn_main" }],
    results: [],
    analyses: [],
    condition_variations: [],
    condition_variation_attempts: []
  }
} as unknown as ChemdTrainingExportV2;

describe("authoring diagnostics", () => {
  it("emits safe-fix diagnostics for declaration-field targets", () => {
    const assistance: AuthoringAssistance = {
      minimal_sets: [],
      templates: [],
      suggestions: [{
        suggestion_id: "suggest-result-ref-res_main",
        title: "Bind result",
        description: "Result can be bound to the only reaction.",
        category: "reference",
        confidence: "high",
        target: {
          kind: "declaration_field",
          declarationId: "res_main",
          field: "reaction"
        },
        patch: {
          kind: "insert_declaration_field",
          declarationId: "res_main",
          line: "reaction: @rxn_main"
        }
      }]
    };

    expect(buildAuthoringDiagnostics(assistance, trainingExport)).toContainEqual(
      expect.objectContaining({
        code: "W_AUTHORING_FIX_AVAILABLE",
        sourceNodeId: "res_main",
        sourceField: "reaction",
        facts: expect.objectContaining({
          target_kind: "declaration_field",
          target_declaration_id: "res_main",
          target_field: "reaction"
        })
      })
    );
  });

  it("keeps required-input diagnostics separate from quick fixes", () => {
    const assistance: AuthoringAssistance = {
      suggestions: [],
      templates: [],
      minimal_sets: [{
        checklist_id: "basic-experiment-record",
        title: "最小实验记录",
        description: "需要 reaction/result。",
        status: "needs_author_input",
        missing_items: ["至少一个 result 声明"],
        inferable_items: [],
        suggestion_ids: []
      }]
    };

    expect(buildAuthoringDiagnostics(assistance, trainingExport)).toContainEqual(
      expect.objectContaining({
        code: "W_AUTHORING_INPUT_REQUIRED",
        sourceLayer: "compiler",
        facts: expect.objectContaining({
          checklist_id: "basic-experiment-record",
          missing_items: ["至少一个 result 声明"]
        })
      })
    );
  });
});
