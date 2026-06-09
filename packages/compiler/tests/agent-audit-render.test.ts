import { describe, expect, it } from "vitest";

import { compileChemd } from "../src";
import { renderAgentRunAuditBlock } from "../src/agent-audit-render";

describe("agent audit render", () => {
  it("renders a valid source-level agent run audit block", () => {
    const auditBlock = renderAgentRunAuditBlock({
      diagnosticsSummary: "0 errors, 0 warnings",
      driverName: "chemd-source-repair-driver",
      goal: "repair LLM-generated chemd source",
      runId: "llm_repair_001",
      status: "completed",
      targetFiles: ["draft.chemd"]
    });
    const source = `module exp_audit_render

meta {
  id: "exp-audit-render"
  title: "Audit render"
  date: "2026-06-08"
}

reaction rxn_main {
  reactants: ["substrate"]
}

${auditBlock}
`;

    expect(auditBlock).toContain("agent run llm_repair_001");
    expect(auditBlock).toContain("tool compile_current_file");
    expect(auditBlock).toContain("tool propose_repair");
    expect(compileChemd(source).diagnostics.filter((item) => item.severity === "error")).toEqual([]);
  });
});
