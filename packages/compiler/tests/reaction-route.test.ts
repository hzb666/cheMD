import { describe, expect, it } from "vitest";

import { compileChemd } from "../src/index";

describe("compiler reaction route support", () => {
  it("passes reaction route context through typecheck and export layers", () => {
    const result = compileChemd(`---
id: exp-compiler-route
title: compiler route
date: 2026-04-24
---

:::chemd #rxn-step-02
kind: reaction
route: route-a
prev: route-doc#rxn-step-01
reactants: b
products: c
:::

:::chemd #rxn-step-03
kind: reaction
route: route-a
prev: rxn-step-02
reactants: c
products: d
:::`, {
      reactionRouteContext: {
        externalReactions: [{
          refId: "route-doc#rxn-step-01",
          routeId: "route-a",
          prevRefIds: []
        }, {
          refId: "route-doc#rxn-step-04",
          routeId: "route-a",
          prevRefIds: ["exp-compiler-route#rxn-step-03"]
        }]
      }
    });

    const step3 = result.typedSemanticGraph.nodes.find((node) =>
      node.kind === "reaction" && node.nodeId === "rxn-step-03"
    );

    expect(step3).toMatchObject({
      next: [expect.objectContaining({
        refId: "route-doc#rxn-step-04",
        targetKind: "reaction",
        resolved: true
      })]
    });
    expect(result.trainingExport.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "reaction_depends_on_reaction",
        from_entity_id: "rxn::exp-compiler-route::rxn-step-02",
        to_entity_id: "rxn::route-doc::rxn-step-01"
      })
    ]));
    expect(result.trainingUnderstanding.experiment_logic.reaction_routes).toContainEqual(
      expect.objectContaining({
        reaction_entity_id: "rxn::exp-compiler-route::rxn-step-03",
        next_reaction_entity_ids: ["rxn::route-doc::rxn-step-04"]
      })
    );
  });

  it("surfaces route topology diagnostics through compiler diagnosis", () => {
    const result = compileChemd(`---
id: exp-compiler-route-diagnostics
title: compiler route diagnostics
date: 2026-04-24
---

:::chemd #rxn-a
kind: reaction
route: route-z
prev: rxn-b
reactants: a
products: b
:::

:::chemd #rxn-b
kind: reaction
route: route-z
prev: rxn-a
reactants: b
products: c
:::

:::chemd #rxn-orphan
kind: reaction
route: route-z
reactants: x
products: y
:::`);

    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_REACTION_ROUTE_CYCLE" }),
      expect.objectContaining({ code: "W_REACTION_ROUTE_ORPHAN", sourceNodeId: "rxn-orphan" })
    ]));
    expect(result.diagnosis.status).toBe("mixed");
    expect(result.diagnosis.manualReviewItems).toContainEqual(expect.objectContaining({
      diagnosticCode: "E_REACTION_ROUTE_CYCLE"
    }));
  });
});
