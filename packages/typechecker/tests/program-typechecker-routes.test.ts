import { describe, expect, it } from "vitest";

import { parseChemdProgram } from "@chemd/parser";

import { typecheckProgram } from "../src/index";

const parse = (source: string) => parseChemdProgram(source);

describe("program typechecker reaction routes", () => {
  it("augments program reaction routes with local and external route context", () => {
    const result = typecheckProgram(parse(`module exp_route

meta {
  id: "exp-route"
  title: "Route"
  date: "2026-05-28"
}

reaction rxn_a {
  route: "main"
}

reaction rxn_b {
  route: "main"
  prev: [@rxn_a]
}

reaction rxn_c {
  route: "main"
  prev: [@external-doc#rxn_d]
}

reaction rxn_orphan {
  route: "orphaned"
}
`), {
      reactionRouteContext: {
        externalReactions: [
          {
            refId: "external-doc#rxn_d",
            routeId: "main",
            prevRefIds: ["exp-route#rxn_b"]
          },
          {
            refId: "external-doc#rxn_e",
            routeId: "orphaned"
          }
        ]
      }
    });
    const rxnA = result.typedGraph.nodes.find((node) => node.nodeId === "rxn_a");
    const rxnB = result.typedGraph.nodes.find((node) => node.nodeId === "rxn_b");
    const rxnC = result.typedGraph.nodes.find((node) => node.nodeId === "rxn_c");

    expect(rxnA).toMatchObject({
      kind: "reaction",
      next: [
        { refId: "rxn_b", targetKind: "reaction", resolved: true }
      ]
    });
    expect(rxnB).toMatchObject({
      kind: "reaction",
      next: [
        { refId: "external-doc#rxn_d", targetKind: "reaction", resolved: true }
      ]
    });
    expect(rxnC).toMatchObject({
      kind: "reaction",
      prev: [
        { refId: "external-doc#rxn_d", targetKind: "reaction", resolved: true }
      ]
    });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "W_REACTION_ROUTE_ORPHAN",
      sourceNodeId: "rxn_orphan"
    }));
  });

  it("reports program reaction route cycles", () => {
    const result = typecheckProgram(parse(`module exp_route_cycle

meta {
  id: "exp-route-cycle"
  title: "Route cycle"
  date: "2026-05-28"
}

reaction rxn_a {
  route: "cycle"
  prev: [@rxn_b]
}

reaction rxn_b {
  route: "cycle"
  prev: [@rxn_a]
}
`));

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_REACTION_ROUTE_CYCLE"
    }));
  });
});
