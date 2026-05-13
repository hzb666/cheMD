import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";

import { buildRenderableNodeTree } from "../src/index";

describe("buildRenderableNodeTree", () => {
  it("builds molecule and reaction hydration DTOs", () => {
    const document = createDocument(
      { id: "exp-render", title: "Renderable", date: "2026-05-13" },
      {
        children: [
          {
            type: "molecule",
            id: "mol-a",
            name: "Ethanol",
            smiles: "CCO",
            sourceSpan: { startLine: 3, startColumn: 1, endLine: 6, endColumn: 4 },
            fieldSpans: { smiles: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 12 } }
          },
          { type: "reaction", id: "rxn-a", reactants: ["@mol-a"], products: ["@mol-b"] }
        ]
      }
    );
    const tree = buildRenderableNodeTree(document);

    expect(tree.schemaVersion).toBe("chemd.renderable-node.v1");
    expect(tree.root.children).toHaveLength(2);
    expect(tree.root.children[0]).toMatchObject({
      nodeId: "document.01_molecule.mol-a",
      kind: "molecule",
      label: "Ethanol",
      directive: {
        kind: "hydrate",
        target: "molecule",
        hydration: { mode: "lazy", key: "document.01_molecule.mol-a", status: "ready" },
        payload: { id: "mol-a", name: "Ethanol", smiles: "CCO" }
      }
    });
    expect(tree.root.children[0].range).toEqual({ startLine: 3, startColumn: 1, endLine: 6, endColumn: 4 });
    expect(tree.root.children[0].sourceRefs).toEqual([
      { sourceId: "exp-render", range: { startLine: 3, startColumn: 1, endLine: 6, endColumn: 4 } },
      {
        sourceId: "exp-render",
        field: "smiles",
        range: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 12 }
      }
    ]);
    expect(tree.root.children[1].directive).toMatchObject({
      kind: "hydrate",
      target: "reaction",
      payload: { id: "rxn-a", reactants: ["@mol-a"], products: ["@mol-b"] }
    });
  });

  it("uses text directive for markdown fallback", () => {
    const document = createDocument(
      { id: "exp-md", title: "Markdown", date: "2026-05-13" },
      { children: [createMarkdownNode("## Note\nInline content")] }
    );
    const tree = buildRenderableNodeTree(document);

    expect(tree.root.children[0]).toMatchObject({
      kind: "markdown",
      label: "## Note",
      directive: { kind: "text", text: "## Note\nInline content" },
      children: []
    });
  });

  it("preserves col and template nesting strategy", () => {
    const document = createDocument(
      { id: "exp-nested", title: "Nested", date: "2026-05-13" },
      {
        children: [{
          type: "col",
          columns: 2,
          children: [
            { type: "molecule", id: "mol-a", smiles: "CCO" },
            {
              type: "template",
              name: "quick-route",
              bind: {},
              params: ["product"],
              body: [{ type: "reaction", id: "rxn-template", products: ["@product"] }]
            }
          ]
        }]
      }
    );
    const col = buildRenderableNodeTree(document).root.children[0];
    const template = col.children[1];

    expect(col.directive).toEqual({ kind: "layout", display: "columns", columns: 2 });
    expect(col.children[0].nodeId).toBe("document.01_col.01_molecule.mol-a");
    expect(template.directive).toEqual({
      kind: "template",
      template: "quick-route",
      expansion: "nested-body",
      params: ["product"]
    });
    expect(template.children[0].nodeId).toBe("document.01_col.02_template.quick-route.01_reaction.rxn-template");
  });

  it("keeps stable ids and placeholder directives deterministic", () => {
    const document = createDocument(
      { id: "exp-stable", title: "Stable", date: "2026-05-13" },
      { children: [{ type: "molecule", id: "mol-empty" }, { type: "analysis", id: "ana-empty" }] }
    );
    const firstTree = buildRenderableNodeTree(document);
    const secondTree = buildRenderableNodeTree(document);

    expect(secondTree).toEqual(firstTree);
    expect(firstTree.root.children.map((node) => node.nodeId)).toEqual([
      "document.01_molecule.mol-empty",
      "document.02_analysis.ana-empty"
    ]);
    expect(firstTree.root.children.map((node) => node.directive)).toEqual([
      {
        kind: "placeholder",
        target: "molecule",
        hydration: { mode: "lazy", key: "document.01_molecule.mol-empty", status: "placeholder" },
        reason: "missing_render_payload",
        text: "molecule content is not available"
      },
      {
        kind: "placeholder",
        target: "analysis",
        hydration: { mode: "lazy", key: "document.02_analysis.ana-empty", status: "placeholder" },
        reason: "missing_render_payload",
        text: "analysis content is not available"
      }
    ]);
  });

  it("builds an empty document root", () => {
    const tree = buildRenderableNodeTree(
      createDocument({ id: "exp-empty", title: "Empty", date: "2026-05-13" })
    );

    expect(tree.root).toEqual({
      nodeId: "document",
      kind: "document",
      label: "Empty",
      directive: { kind: "document", display: "flow" },
      children: []
    });
  });
});
