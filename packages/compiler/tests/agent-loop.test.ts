import { describe, expect, it, vi } from "vitest";

import { runChemdAgentLoop, type ChemdAgentLoopAgent } from "../src/index";

const cleanProgram = `module exp_agent_loop_clean

meta {
  id: "exp-agent-loop-clean"
  title: "Agent Loop Clean"
  date: "2026-05-29"
  primary_reaction: @rxn_main
  primary_result: @res_main
}

molecule mol_product {
  name: "product"
}

reaction rxn_main {
  reactants: [substrate]
  products: [@mol_product]
}

result res_main for @rxn_main {
  product: @mol_product
  status: success
}
`;

const invalidProgram = `module exp_agent_loop_bad

meta {
  id: "exp-agent-loop-bad"
  title: "Agent Loop Bad"
  date: "2026-05-29"
}

INVALID_PROGRAM
`;

const stalledSyntaxProgram = `module exp_agent_loop_stalled

meta {
  id: "exp-agent-loop-stalled"
  title: "Agent Loop Stalled"
  date: "2026-06-09"
}

reaction rxn_main {
  reactants: ["anisole"]
  temperature: 90 C
`;

describe("runChemdAgentLoop", () => {
  it("skips agent calls when repair already reaches clean", async () => {
    const agent = vi.fn();
    const result = await runChemdAgentLoop(cleanProgram, { agent });

    expect(result.stoppedReason).toBe("clean");
    expect(result.finalResult.diagnosis.status).toBe("clean");
    expect(agent).not.toHaveBeenCalled();
  });

  it("lets the agent rewrite unresolved program diagnostics", async () => {
    const result = await runChemdAgentLoop(invalidProgram, {
      agent: ({ diagnosis }) => ({
        action: "rewrite",
        note: diagnosis.manualReviewItems[0]?.diagnosticCode,
        nextSource: cleanProgram
      })
    });

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(true);
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations[0]?.agentResponse).toMatchObject({
      action: "rewrite",
      changedSource: true,
      note: "E_PROGRAM_DECLARATION_EXPECTED"
    });
  });

  it("lets the agent rewrite after deterministic repair stalls", async () => {
    const agent = vi.fn<ChemdAgentLoopAgent>(() => ({
      action: "rewrite" as const,
      note: "repair stalled",
      nextSource: cleanProgram
    }));
    const result = await runChemdAgentLoop(stalledSyntaxProgram, { agent });

    expect(agent).toHaveBeenCalledOnce();
    expect(agent.mock.calls[0]?.[0].repairResult.stoppedReason).toBe("stalled");
    expect(result.stoppedReason).toBe("clean");
    expect(result.iterations[0]?.agentResponse).toMatchObject({
      action: "rewrite",
      changedSource: true,
      note: "repair stalled"
    });
  });

  it("preserves unresolved diagnosis status when the agent stops", async () => {
    const result = await runChemdAgentLoop(invalidProgram, {
      agent: () => ({
        action: "stop",
        note: "need human rewrite"
      })
    });

    expect(result.stoppedReason).toBe("manual_review");
    expect(result.finalResult.diagnosis.status).toBe("manual_review");
    expect(result.iterations[0]?.agentResponse).toMatchObject({
      action: "stop",
      changedSource: false,
      note: "need human rewrite"
    });
  });

  it("rejects malformed rewrite responses", async () => {
    await expect(runChemdAgentLoop(invalidProgram, {
      agent: () => ({ action: "rewrite" })
    })).rejects.toThrow("Agent loop rewrite responses must provide nextSource.");
  });
});
