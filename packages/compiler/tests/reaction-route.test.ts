import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

describe("compiler reaction route support", () => {
  it("passes reaction route context through program typecheck", () => {
    const result = compileChemd(`module exp_compiler_route

meta {
  id: "exp-compiler-route"
  title: "compiler route"
  date: "2026-05-29"
}

reaction rxn_step_02 {
  route: "route-a"
  prev: [@route-doc#rxn_step_01]
  reactants: [b]
  products: [c]
}

reaction rxn_step_03 {
  route: "route-a"
  prev: [@rxn_step_02]
  reactants: [c]
  products: [d]
}
`, {
      reactionRouteContext: {
        externalReactions: [{
          refId: "route-doc#rxn_step_01",
          routeId: "route-a",
          prevRefIds: []
        }, {
          refId: "route-doc#rxn_step_04",
          routeId: "route-a",
          prevRefIds: ["exp-compiler-route#rxn_step_03"]
        }]
      }
    });

    const step3 = result.typedSemanticGraph.nodes.find((node) =>
      node.kind === "reaction" && node.nodeId === "rxn_step_03"
    );

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
    expect(step3).toMatchObject({
      next: [expect.objectContaining({
        refId: "route-doc#rxn_step_04",
        targetKind: "reaction",
        resolved: true
      })]
    });
  });

  it("surfaces route topology diagnostics through compiler diagnosis", () => {
    const result = compileChemd(`module exp_compiler_route_diagnostics

meta {
  id: "exp-compiler-route-diagnostics"
  title: "compiler route diagnostics"
  date: "2026-05-29"
}

reaction rxn_a {
  route: "route-z"
  prev: [@rxn_b]
  reactants: [a]
  products: [b]
}

reaction rxn_b {
  route: "route-z"
  prev: [@rxn_a]
  reactants: [b]
  products: [c]
}

reaction rxn_orphan {
  route: "route-z"
  reactants: [x]
  products: [y]
}
`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_REACTION_ROUTE_CYCLE" }),
      expect.objectContaining({ code: "W_REACTION_ROUTE_ORPHAN", sourceNodeId: "rxn_orphan" })
    ]));
    expect(result.diagnosis.status).toBe("mixed");
    expect(result.diagnosis.manualReviewItems).toContainEqual(expect.objectContaining({
      diagnosticCode: "E_REACTION_ROUTE_CYCLE"
    }));
  });
});
