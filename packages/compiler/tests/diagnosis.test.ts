import type { Diagnostic } from "@chemd/core";
import { describe, expect, it } from "vitest";

import {
  applyCompilerDiagnosisSafeFixes,
  buildCompilerDiagnosis
} from "../src/diagnosis";

describe("compiler diagnosis", () => {
  it("classifies declaration-target safe quick fixes", () => {
    const diagnostics: Diagnostic[] = [{
      code: "W_AUTHORING_FIX_AVAILABLE",
      severity: "warning",
      message: "Result can be bound to the only reaction.",
      sourceLayer: "compiler",
      sourceNodeId: "res_main",
      sourceField: "reaction",
      facts: {
        suggestion_id: "suggest-result-ref-res_main",
        target_kind: "declaration_field"
      },
      quickFixes: [{
        title: "Bind result",
        kind: "apply_authoring_patch",
        patch: {
          kind: "insert_declaration_field",
          declarationId: "res_main",
          line: "reaction: @rxn_main"
        }
      }]
    }];

    expect(buildCompilerDiagnosis(diagnostics)).toMatchObject({
      status: "fixable",
      summary: {
        safeFixCount: 1,
        requiredInputCount: 0,
        manualReviewCount: 0
      },
      safeFixes: [expect.objectContaining({
        fixId: "suggest-result-ref-res_main",
        sourceNodeId: "res_main",
        sourceField: "reaction"
      })],
      nextActions: ["apply_safe_fixes", "recompile"]
    });
  });

  it("applies program declaration safe fixes in order", () => {
    const source = `module exp_diagnosis

meta {
  id: "exp-diagnosis"
  title: "Diagnosis"
  date: "2026-05-29"
}

result res_main {
  status: success
}
`;
    const diagnosis = buildCompilerDiagnosis([{
      code: "W_AUTHORING_FIX_AVAILABLE",
      severity: "warning",
      message: "Result can be bound.",
      quickFixes: [{
        title: "Bind result",
        kind: "apply_authoring_patch",
        patch: {
          kind: "insert_declaration_field",
          declarationId: "res_main",
          line: "reaction: @rxn_main"
        }
      }]
    }]);

    expect(applyCompilerDiagnosisSafeFixes(source, diagnosis)).toContain(`result res_main {
  status: success
  reaction: @rxn_main
}`);
  });

  it("exposes required authored facts separately from safe fixes", () => {
    const diagnosis = buildCompilerDiagnosis([{
      code: "W_AUTHORING_INPUT_REQUIRED",
      severity: "warning",
      message: "最小实验记录 未完整表达：至少一个 result 声明",
      sourceLayer: "compiler",
      facts: {
        checklist_id: "basic-experiment-record",
        title: "最小实验记录",
        description: "需要 result。",
        missing_items: ["至少一个 result 声明"]
      }
    }]);

    expect(diagnosis).toMatchObject({
      status: "needs_author_input",
      requiredInputs: [expect.objectContaining({
        checklistId: "basic-experiment-record",
        missingItems: ["至少一个 result 声明"]
      })],
      nextActions: ["ask_for_required_inputs"]
    });
  });

  it("routes unresolved program diagnostics to manual review", () => {
    const diagnosis = buildCompilerDiagnosis([{
      code: "E_PROGRAM_DECLARATION_EXPECTED",
      severity: "error",
      message: "Expected a declaration.",
      sourceLayer: "parser",
      sourceNodeId: "doc_1"
    }]);

    expect(diagnosis).toMatchObject({
      status: "manual_review",
      summary: { manualReviewCount: 1 },
      nextActions: ["manual_rewrite"]
    });
  });
});
