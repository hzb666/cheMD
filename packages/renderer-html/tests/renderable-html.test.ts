import { describe, expect, it } from "vitest";

import type { ChemdRenderableNodeTreeV1 } from "@chemd/renderer-json";

import { renderRenderableHtml } from "../src/index";

describe("renderRenderableHtml", () => {
  it("renders stable node and source ref attributes", () => {
    const html = renderRenderableHtml({
      schemaVersion: "chemd.renderable-node.v1",
      root: {
        nodeId: "document",
        kind: "document",
        label: "Source doc",
        directive: { kind: "document", display: "flow" },
        children: [{
          nodeId: "document.01_molecule.mol-a",
          kind: "molecule",
          label: "Ethanol",
          range: { startLine: 3, startColumn: 1, endLine: 6, endColumn: 4 },
          sourceRefs: [
            { sourceId: "exp-a", range: { startLine: 3, startColumn: 1, endLine: 6, endColumn: 4 } },
            { sourceId: "exp-a", field: "smiles", range: { startLine: 5, startColumn: 1, endLine: 5, endColumn: 12 } }
          ],
          directive: {
            kind: "hydrate",
            target: "molecule",
            hydration: { mode: "lazy", key: "document.01_molecule.mol-a", status: "ready" },
            payload: { smiles: "CCO" },
            fallback: "placeholder"
          },
          children: []
        }]
      }
    });

    expect(html).toContain('data-chemd-node-id="document.01_molecule.mol-a"');
    expect(html).toContain('data-chemd-node-kind="molecule"');
    expect(html).toContain('data-chemd-render-state="ready"');
    expect(html).toContain("data-chemd-source-refs=");
    expect(html).toContain("&quot;sourceId&quot;:&quot;exp-a&quot;");
    expect(html).toContain("&quot;field&quot;:&quot;smiles&quot;");
  });

  it("renders lazy hydration nodes as placeholders without payload details", () => {
    const html = renderRenderableHtml(treeWithChildren([{
      nodeId: "document.01_reaction.rxn-a",
      kind: "reaction",
      label: "Hydrogenation",
      directive: {
        kind: "hydrate",
        target: "reaction",
        hydration: { mode: "lazy", key: "document.01_reaction.rxn-a", status: "ready" },
        payload: { reactants: ["secret-reactant"], products: ["secret-product"] },
        fallback: "placeholder"
      },
      children: []
    }]));

    expect(html).toContain('data-chemd-hydration-target="reaction"');
    expect(html).toContain('data-chemd-hydration-key="document.01_reaction.rxn-a"');
    expect(html).toContain("Hydrogenation");
    expect(html).not.toContain("secret-reactant");
    expect(html).not.toContain("secret-product");
  });

  it("recursively renders text, layout, and template children", () => {
    const html = renderRenderableHtml(treeWithChildren([{
      nodeId: "document.01_col",
      kind: "col",
      label: "2 columns",
      directive: { kind: "layout", display: "columns", columns: 2 },
      children: [
        {
          nodeId: "document.01_col.01_markdown",
          kind: "markdown",
          label: "Intro",
          directive: { kind: "text", text: "Nested <text>" },
          children: []
        },
        {
          nodeId: "document.01_col.02_template.quick",
          kind: "template",
          label: "quick",
          directive: { kind: "template", template: "quick", expansion: "nested-body", params: ["product"] },
          children: [{
            nodeId: "document.01_col.02_template.quick.01_markdown",
            kind: "markdown",
            label: "Body",
            directive: { kind: "text", text: "Template body" },
            children: []
          }]
        }
      ]
    }]));

    expect(html).toContain('data-chemd-layout-columns="2"');
    expect(html).toContain('data-chemd-template-name="quick"');
    expect(html).toContain("Nested &lt;text&gt;");
    expect(html).toContain("Template body");
  });

  it("escapes visible text and JSON attributes", () => {
    const html = renderRenderableHtml(treeWithChildren([{
      nodeId: "document.01_markdown",
      kind: "markdown",
      label: "\"quoted\" <label>",
      sourceRefs: [{ sourceId: "exp<&>", range: { startLine: 1, startColumn: 2, endLine: 3, endColumn: 4 } }],
      directive: { kind: "text", text: "5 < 6 & \"safe\"" },
      children: []
    }]));

    expect(html).toContain("&quot;quoted&quot; &lt;label&gt;");
    expect(html).toContain("5 &lt; 6 &amp; &quot;safe&quot;");
    expect(html).toContain("exp&lt;&amp;&gt;");
    expect(html).not.toContain("5 < 6");
  });

  it("renders an empty tree and degrades nodes with missing directives", () => {
    const malformedNode = {
      nodeId: "document.01_unknown",
      kind: "molecule",
      label: "Missing directive",
      children: []
    } as unknown as ChemdRenderableNodeTreeV1["root"];
    const tree = treeWithChildren([malformedNode]);
    const html = renderRenderableHtml(tree);

    expect(html).toContain('data-chemd-node-id="document"');
    expect(html).toContain('data-chemd-render-state="rendered"');
    expect(html).toContain('data-chemd-node-id="document.01_unknown"');
    expect(html).toContain('data-chemd-render-state="fallback"');
    expect(renderRenderableHtml(treeWithChildren([]))).toContain("chemd-renderable-tree");
  });
});

const treeWithChildren = (
  children: ChemdRenderableNodeTreeV1["root"]["children"]
): ChemdRenderableNodeTreeV1 => ({
  schemaVersion: "chemd.renderable-node.v1",
  root: {
    nodeId: "document",
    kind: "document",
    label: "Test document",
    directive: { kind: "document", display: "flow" },
    children
  }
});
