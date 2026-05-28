import { describe, expect, it } from "vitest";

import { applyDiagnosticQuickFix, type DiagnosticWithQuickFixes } from "../src/index";

const diagnostic: DiagnosticWithQuickFixes = {
  code: "W_AUTHORING_FIX_AVAILABLE",
  severity: "warning",
  message: "Declaration is missing a conservative program field.",
  sourceLayer: "compiler",
  sourceNodeId: "res_main"
};

describe("applyDiagnosticQuickFix", () => {
  it("applies a conservative declaration field patch", () => {
    const source = `module exp_quick_fix

meta {
  id: "exp-quick-fix"
  title: "Quick fix"
  date: "2026-05-29"
}

result res_main {
  status: success
}
`;

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Bind result",
      kind: "apply_authoring_patch",
      patch: {
        kind: "insert_declaration_field",
        declarationId: "res_main",
        line: "reaction: @rxn_main"
      }
    })).toContain(`result res_main {
  status: success
  reaction: @rxn_main
}`);
  });

  it("applies a conservative meta field patch", () => {
    const source = `module exp_quick_fix

meta {
  id: "exp-quick-fix"
  title: "Quick fix"
  date: "2026-05-29"
}
`;

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Bind primary result",
      kind: "apply_authoring_patch",
      patch: {
        kind: "insert_meta_field",
        line: "primary_result: @res_main",
        anchorFields: ["date"]
      }
    })).toContain(`  date: "2026-05-29"
  primary_result: @res_main`);
  });

  it("ignores removed legacy quick-fix kinds", () => {
    const source = `module exp_quick_fix

reaction rxn_main {
  reactants: [substrate]
}
`;

    expect(applyDiagnosticQuickFix(source, diagnostic, {
      title: "Insert kind",
      kind: "insert_chemd_kind",
      patch: { source_node_id: "rxn_main", kind: "reaction" }
    })).toBe(source);
  });
});
