import type { ChemdDocument } from "@chemd/core";
import { describe, expect, it } from "vitest";

import {
  buildChemdShellAttributes,
  buildSemanticRenderTree
} from "../src/index";

const createDocument = (children: unknown[]): ChemdDocument => ({
  type: "document",
  meta: {
    id: "doc-1",
    title: "Semantic render test",
    date: "2026-05-13"
  },
  children: children as ChemdDocument["children"],
  diagnostics: []
});

describe("semantic render tree", () => {
  it("builds molecule and reaction renderable nodes with stable ids", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "molecule", id: "mol-a", name: "A", smiles: "CCO" },
      { type: "reaction", id: "rxn-1", reactants: ["mol-a"], products: ["mol-b"] }
    ]));

    expect(tree.nodes.map((node) => node.node_id)).toEqual([
      "document::doc-1",
      "molecule::mol-a",
      "reaction::rxn-1"
    ]);
    expect(tree.nodes[1]).toMatchObject({
      node_type: "ChemdMoleculeNode",
      entity_id: "molecule::mol-a",
      render: { component: "MoleculeBlock", hydrate: "visible" }
    });
    expect(tree.nodes[2]).toMatchObject({
      node_type: "ChemdReactionNode",
      entity_id: "reaction::rxn-1",
      render: { component: "ReactionBlock", hydrate: "visible" }
    });
  });

  it("preserves procedure, result, and template nodes in document order", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "procedure", id: "proc-1", steps: [{ type: "step", stepId: "s1", family: "add" }] },
      { type: "result", id: "res-1", yield: "83%" },
      { type: "template", name: "standard-workup", params: ["solvent"], body: [] }
    ]));

    expect(tree.nodes.map((node) => node.node_type)).toEqual([
      "ChemdDocumentNode",
      "ChemdProcedureNode",
      "ChemdProcedureStepNode",
      "ChemdResultNode",
      "ChemdTemplateNode"
    ]);
    expect(tree.nodes.map((node) => node.node_id)).toEqual([
      "document::doc-1",
      "procedure::proc-1",
      "procedure-step::s1",
      "result::res-1",
      "template::standard-workup"
    ]);
  });

  it("preserves source ranges and compiler diagnostics", () => {
    const document = createDocument([
      {
        type: "result",
        id: "res-source",
        yield: "91%",
        sourceSpan: { start: 10, end: 30, startLine: 3, endLine: 4 }
      }
    ]);
    const tree = buildSemanticRenderTree({
      document,
      sourceHash: "hash-1",
      diagnostics: [
        {
          code: "result.warning",
          severity: "warning",
          message: "Check isolated mass",
          nodeId: "res-source"
        }
      ]
    });

    const resultNode = tree.nodes.find((node) => node.semantic_id === "res-source");
    expect(resultNode?.source_ref).toEqual({
      source_kind: "chemd",
      source_uri: undefined,
      start_line: 3,
      end_line: 4,
      start_offset: 10,
      end_offset: 30,
      source_hash: "hash-1"
    });
    expect(resultNode?.diagnostics).toEqual([
      {
        code: "result.warning",
        severity: "warning",
        message: "Check isolated mass",
        node_id: "res-source",
        source_ref: undefined,
        facts: undefined
      }
    ]);
    expect(tree.warnings).toHaveLength(1);
  });

  it("builds data-chemd shell attributes without DOM or React output", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "reaction", id: "rxn-attrs", products: ["p1"] }
    ]));
    const reactionNode = tree.nodes[1];

    expect(buildChemdShellAttributes(reactionNode)).toEqual({
      "data-chemd-node-id": "reaction::rxn-attrs",
      "data-chemd-type": "ChemdReactionNode",
      "data-chemd-component": "ReactionBlock",
      "data-chemd-hydrate": "visible",
      "data-chemd-render-state": "placeholder",
      "data-chemd-document-id": "doc-1",
      "data-chemd-entity-id": "reaction::rxn-attrs",
      "data-chemd-semantic-id": "rxn-attrs"
    });
  });

  it("keeps unknown nodes renderable through a fallback directive", () => {
    const tree = buildSemanticRenderTree(createDocument([
      { type: "future_cluster_map", id: "map-1", label: "future" }
    ]));
    const unknownNode = tree.nodes[1];

    expect(unknownNode).toMatchObject({
      node_id: "unknown::map-1",
      node_type: "ChemdUnknownNode",
      render: {
        component: "UnknownChemdNode",
        hydrate: "never",
        fallback: "Unsupported Chemd node"
      },
      attrs: {
        type: "future_cluster_map",
        id: "map-1",
        label: "future",
        unknown_type: "future_cluster_map"
      }
    });
    expect(tree.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic_rendering.unknown_node_type",
      severity: "error"
    }));
  });
});
