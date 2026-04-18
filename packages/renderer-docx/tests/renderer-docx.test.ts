import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import { resolveRenderProfile } from "@chemd/render-profile";

import { renderDocxBridge, renderDocxMarkdown } from "../src/index";

describe("DOCX bridge renderer", () => {
  it("renders Markdown and bridge payloads", () => {
    const document = createDocument(
      { id: "exp-docx", title: "DOCX test", date: "2026-04-17" },
      { children: [createMarkdownNode("body text")] }
    );

    expect(renderDocxMarkdown(document)).toContain("# DOCX test");
    expect(JSON.parse(renderDocxBridge(document, resolveRenderProfile()))).toMatchObject({
      version: "v0.1"
    });
  });

  it("renders surface origin metadata and explicit procedure steps in Markdown", () => {
    const document = createDocument(
      { id: "exp-docx-origin", title: "DOCX origin test", date: "2026-04-17" },
      {
        children: [
          {
            type: "molecule",
            id: "mol-main",
            smiles: "CCO",
            syntaxOrigin: "chemd",
            declaredKind: "molecule"
          },
          {
            type: "procedure",
            id: "proc-main",
            steps: [{
              type: "step",
              family: "add",
              params: { materials: "A" },
              outputs: ["intermediate"]
            }]
          }
        ]
      }
    );
    const markdown = renderDocxMarkdown(document);

    expect(markdown).toContain("- Surface origin: chemd");
    expect(markdown).toContain("- Declared kind: molecule");
    expect(markdown).toContain("- SMILES: CCO");
    expect(markdown).toContain("- Step 1: add | materials=A | outputs=intermediate");
  });

  it("renders nested col children instead of dropping the layout block", () => {
    const document = createDocument(
      { id: "exp-docx-col", title: "DOCX col test", date: "2026-04-19" },
      {
        children: [{
          type: "col",
          columns: 2,
          children: [
            { type: "molecule", id: "mol-a", smiles: "CCO", cas: "64-17-5" },
            { type: "reaction", id: "rxn-a", reactants: ["@mol-a"], products: ["product"] }
          ]
        }]
      }
    );
    const markdown = renderDocxMarkdown(document);

    expect(markdown).toContain("### Columns (2)");
    expect(markdown).toContain("### Molecule `mol-a`");
    expect(markdown).toContain("- CAS: 64-17-5");
    expect(markdown).toContain("### Reaction `rxn-a`");
  });

  it("includes typed graph data in bridge payloads when supplied", () => {
    const document = createDocument(
      { id: "exp-docx-semantic", title: "DOCX semantic test", date: "2026-04-17" },
      { children: [createMarkdownNode("body text")] }
    );
    const typedGraph = {
      documentId: "exp-docx-semantic",
      nodes: [
        {
          nodeId: "ana-tlc",
          kind: "analysis",
          normalizedTlc: {
            status: "partial_conversion"
          }
        }
      ],
      quantities: [],
      diagnostics: []
    };

    expect(JSON.parse(renderDocxBridge(document, resolveRenderProfile(), undefined, { typedGraph }))).toMatchObject({
      semantic: {
        typedGraph: {
          nodes: [
            {
              nodeId: "ana-tlc",
              normalizedTlc: {
                status: "partial_conversion"
              }
            }
          ]
        }
      }
    });
  });
});
