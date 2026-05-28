import { describe, expect, it } from "vitest";

import { runChemdRepairLoop } from "../src/index";

const cleanProgram = `module exp_repair_loop

meta {
  id: "exp-repair-loop"
  title: "Repair loop"
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

describe("runChemdRepairLoop", () => {
  it("stops cleanly for a valid program document", () => {
    const result = runChemdRepairLoop(cleanProgram);

    expect(result.stoppedReason).toBe("clean");
    expect(result.changed).toBe(false);
    expect(result.iterations).toHaveLength(1);
    expect(result.finalResult.program.declarations).toHaveLength(3);
  });

  it("stops with manual review when program diagnostics have no safe fixes", () => {
    const result = runChemdRepairLoop(`module exp_repair_loop_bad

meta {
  id: "exp-repair-loop-bad"
  title: "Repair loop bad"
  date: "2026-05-29"
}

INVALID_PROGRAM
`);

    expect(result.stoppedReason).toBe("manual_review");
    expect(result.changed).toBe(false);
    expect(result.totalAppliedSafeFixes).toHaveLength(0);
    expect(result.finalResult.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_PROGRAM_DECLARATION_EXPECTED"
    }));
  });

  it("honors max iteration normalization without applying speculative patches", () => {
    const result = runChemdRepairLoop(cleanProgram, { maxIterations: 1 });

    expect(result.stoppedReason).toBe("clean");
    expect(result.maxIterations).toBe(1);
    expect(result.totalAppliedSafeFixes).toHaveLength(0);
  });
});
