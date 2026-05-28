import { describe, expect, it } from "vitest";

import { parseChemd } from "@chemd/parser";
import { resolveChemd } from "@chemd/resolver";
import { typecheckDocument } from "@chemd/typechecker";

import {
  buildTrainingUnderstandingFromRecord,
  exportTrainingRecordFromDocument
} from "../src/index";

describe.skip("legacy training export route links", () => {
  it("exports reaction route links, cross-document refs, and route summaries", () => {
    const document = resolveChemd(parseChemd(`---
id: exp-route-export
title: route export
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
prev: rxn-step-02 | route-doc#rxn-step-01
reactants: c
products: d
:::
`));
    const checked = typecheckDocument(document, {
      reactionRouteContext: {
        externalReactions: [{
          refId: "route-doc#rxn-step-01",
          routeId: "route-a",
          prevRefIds: []
        }, {
          refId: "route-doc#rxn-step-04",
          routeId: "route-a",
          prevRefIds: ["exp-route-export#rxn-step-03"]
        }]
      }
    });
    const record = exportTrainingRecordFromDocument(document, {
      typedGraph: checked.typedGraph
    });
    const understanding = buildTrainingUnderstandingFromRecord(record);

    expect(record.semantic_layer.reactions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        original_id: "rxn-step-02",
        route_raw: "route-a",
        prev_refs_raw: ["route-doc#rxn-step-01"],
        resolved_prev_refs_raw: ["route-doc#rxn-step-01"]
      }),
      expect.objectContaining({
        original_id: "rxn-step-03",
        next_refs_raw: ["route-doc#rxn-step-04"]
      })
    ]));
    expect(record.semantic_layer.links).toEqual(expect.arrayContaining([
      expect.objectContaining({
        relation_type: "reaction_depends_on_reaction",
        from_entity_id: "rxn::exp-route-export::rxn-step-02",
        to_entity_id: "rxn::route-doc::rxn-step-01"
      }),
      expect.objectContaining({
        relation_type: "reaction_precedes_reaction",
        from_entity_id: "rxn::exp-route-export::rxn-step-03",
        to_entity_id: "rxn::route-doc::rxn-step-04"
      })
    ]));
    expect(understanding.resolved_references).toContainEqual(expect.objectContaining({
      raw: "route-doc#rxn-step-01",
      source_entity_id: "rxn::exp-route-export::rxn-step-02",
      source_field: "prev",
      target_entity_id: "rxn::route-doc::rxn-step-01",
      relation_type: "reaction_depends_on_reaction",
      resolution_status: "resolved"
    }));
    expect(understanding.resolved_references).toContainEqual(expect.objectContaining({
      raw: "route-doc#rxn-step-01",
      source_entity_id: "rxn::exp-route-export::rxn-step-03",
      source_field: "prev",
      target_entity_id: "rxn::route-doc::rxn-step-01",
      relation_type: "reaction_depends_on_reaction",
      resolution_status: "resolved"
    }));
    expect(understanding.resolved_references).toContainEqual(expect.objectContaining({
      raw: "route-doc#rxn-step-04",
      source_entity_id: "rxn::exp-route-export::rxn-step-03",
      source_field: "next",
      target_entity_id: "rxn::route-doc::rxn-step-04",
      relation_type: "reaction_precedes_reaction",
      resolution_status: "resolved"
    }));
    expect(understanding.experiment_logic.reaction_routes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        route_id: "route-a",
        reaction_entity_id: "rxn::exp-route-export::rxn-step-02",
        prev_reaction_entity_ids: ["rxn::route-doc::rxn-step-01"],
        next_reaction_entity_ids: ["rxn::exp-route-export::rxn-step-03"],
        step_role: "intermediate"
      }),
      expect.objectContaining({
        route_id: "route-a",
        reaction_entity_id: "rxn::exp-route-export::rxn-step-03",
        prev_reaction_entity_ids: ["rxn::exp-route-export::rxn-step-02", "rxn::route-doc::rxn-step-01"],
        next_reaction_entity_ids: ["rxn::route-doc::rxn-step-04"],
        step_role: "intermediate"
      })
    ]));
    expect(understanding.knowledge_graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        node_id: "rxn::route-doc::rxn-step-01",
        node_type: "reaction"
      }),
      expect.objectContaining({
        node_id: "rxn::route-doc::rxn-step-04",
        node_type: "reaction"
      })
    ]));
  });
});
