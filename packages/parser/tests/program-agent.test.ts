import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "../src/program";

describe("parseChemdProgram agent runs", () => {
  it("parses nested tool calls patch proposals and decisions", () => {
    const document = parseChemdProgram(`module exp_agent

meta {
  id: "exp-agent"
  title: "Agent audit"
  date: "2026-05-28"
}

reaction rxn_var1 {
  name: "screen"
}

result res_var1 for @rxn_var1 {
  status: success
}

agent run repair_001 {
  goal: "validate selected variant and bind primary result"
  status: completed
  target_files: ["screen.chemd"]
  evidence: [@rxn_var1, @res_var1]

  tool compile_current_file {
    status: ok
    evidence: [@rxn_var1, @res_var1]
    output: { diagnostics: [] }
  }

  patch proposed {
    title: "bind primary_result"
    edit meta.primary_result = @res_var1
    edit rxn_var1.temperature = 45 C
  }

  decision approved {
    rationale: "res_var1 is the selected result"
  }

  timeline completed {
    at: "2026-05-28T15:00:00Z"
    actor: "codex"
    summary: "finished"
    tool: "compile_current_file"
    patch: "proposed"
    evidence: [@res_var1]
  }
}
`);

    const agent = document.declarations.find((item) => item.kind === "agent_run");

    expect(agent).toMatchObject({
      kind: "agent_run",
      id: "repair_001",
      qualifiedId: "exp_agent.repair_001",
      goal: "validate selected variant and bind primary result",
      status: "completed",
      targetFiles: ["screen.chemd"],
      evidence: [
        {
          kind: "evidence",
          id: "evidence_1",
          refs: [
            expect.objectContaining({ target: "rxn_var1" }),
            expect.objectContaining({ target: "res_var1" })
          ]
        }
      ],
      toolCalls: [
        {
          kind: "tool",
          id: "compile_current_file",
          name: "compile_current_file",
          status: "ok",
          evidence: [
            expect.objectContaining({ target: "rxn_var1" }),
            expect.objectContaining({ target: "res_var1" })
          ],
          output: expect.objectContaining({ type: "record" })
        }
      ],
      patches: [
        {
          kind: "patch",
          id: "proposed",
          status: "proposed",
          title: "bind primary_result",
          edits: [
            {
              target: { kind: "meta_field", field: "primary_result" },
              value: expect.objectContaining({ target: "res_var1" })
            },
            {
              target: {
                kind: "declaration_field",
                declarationId: "rxn_var1",
                field: "temperature"
              },
              value: expect.objectContaining({ type: "quantity", unit: "C" })
            }
          ]
        }
      ],
      decisions: [
        {
          kind: "decision",
          id: "approved",
          decision: "approved",
          rationale: "res_var1 is the selected result",
          sourceSpan: expect.objectContaining({ endLine: 37 })
        }
      ],
      auditTimeline: [
        {
          kind: "timeline_event",
          event: "completed",
          at: "2026-05-28T15:00:00Z",
          actor: "codex",
          summary: "finished",
          relatedToolCallId: "compile_current_file",
          relatedPatchId: "proposed",
          evidence: [expect.objectContaining({ target: "res_var1" })]
        }
      ]
    });
    expect(document.diagnostics).toEqual([]);
  });
});
