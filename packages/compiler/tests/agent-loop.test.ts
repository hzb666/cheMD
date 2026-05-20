import { describe, expect, it, vi } from "vitest";

import { runChemdAgentLoop } from "../src/index";

const sourceNeedingFacts = `---
id: exp-agent-loop
title: Agent Loop
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::
`;

const cleanRecordSource = `---
id: exp-agent-loop-clean
title: Agent Loop Clean
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
ref: rxn-main
status: success
yield: 72 %
:::

:::analysis #ana-main
ref: rxn-main
type: tlc
result: one major spot
:::
`;

describe("runChemdAgentLoop", () => {
  it("skips agent calls when repair already reaches clean", async () => {
    const agent = vi.fn();
    const result = await runChemdAgentLoop(cleanRecordSource, {
      agent
    });

    expect(result.stoppedReason).toBe("clean");
    expect(result.finalResult.diagnosis.status).toBe("clean");
    expect(agent).not.toHaveBeenCalled();
  });

  it("lets the agent rewrite unresolved records and reaches clean after recompile", async () => {
    const result = await runChemdAgentLoop(sourceNeedingFacts, {
      agent: ({ source }) => ({
        action: "rewrite",
        note: "add linked result",
        nextSource: `${source}
:::result #res-main
ref: rxn-main
status: success
yield: 72 %
:::

:::analysis #ana-main
ref: rxn-main
type: tlc
result: one major spot
:::
`
      })
    });

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(true);
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations[0]?.agentResponse).toMatchObject({
      action: "rewrite",
      changedSource: true,
      note: "add linked result"
    });
    expect(result.finalResult.diagnosis.status).toBe("clean");
    expect(result.finalSource).toContain(":::result #res-main");
  });

  it("stops with the unresolved diagnosis status when the agent declines to rewrite", async () => {
    const result = await runChemdAgentLoop(sourceNeedingFacts, {
      agent: () => ({
        action: "stop",
        note: "need human facts"
      })
    });

    expect(result.stoppedReason).toBe("needs_author_input");
    expect(result.finalResult.diagnosis.status).toBe("needs_author_input");
    expect(result.iterations[0]?.agentResponse).toMatchObject({
      action: "stop",
      changedSource: false,
      note: "need human facts"
    });
  });

  it("stops when the repair stage exhausts its own iteration budget", async () => {
    const result = await runChemdAgentLoop(`---
id: exp-agent-loop-repair-budget
title: Agent Loop Repair Budget
date: 2026-04-24
---

:::chemd #rxn-main
kind: reaction
reactants: substrate
products: product
:::

:::result #res-main
status: success
yield: 72 %
:::

:::analysis #ana-main
type: tlc
result: one major spot
:::
`, {
      repairMaxIterations: 1,
      agent: () => ({
        action: "rewrite",
        nextSource: cleanRecordSource
      })
    });

    expect(result.stoppedReason).toBe("repair_max_iterations");
    expect(result.finalResult.diagnosis.status).toBe("fixable");
  });
});
