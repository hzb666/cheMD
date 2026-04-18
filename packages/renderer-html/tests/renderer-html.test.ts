import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import { resolveRenderProfile } from "@chemd/render-profile";

import { renderHtml } from "../src/index";

describe("renderHtml", () => {
  it("renders a document title and Markdown content", () => {
    const document = createDocument(
      { id: "exp-html", title: "HTML test", date: "2026-04-17" },
      { children: [createMarkdownNode("body text")] }
    );

    expect(renderHtml(document, resolveRenderProfile())).toContain("HTML test");
  });

  it("renders surface origin metadata and explicit procedure steps", () => {
    const document = createDocument(
      { id: "exp-html-origin", title: "HTML origin test", date: "2026-04-17" },
      {
        children: [
          {
            type: "reaction",
            id: "rxn-main",
            reactants: ["a"],
            products: ["b"],
            syntaxOrigin: "chemd",
            declaredKind: "reaction"
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
    const html = renderHtml(document, resolveRenderProfile());

    expect(html).toContain('data-source-origin="chemd"');
    expect(html).toContain("Surface origin");
    expect(html).toContain("chemd-procedure-steps");
    expect(html).toContain("outputs=intermediate");
  });

  it("renders col layout without dropping nested blocks", () => {
    const document = createDocument(
      { id: "exp-html-col", title: "HTML col", date: "2026-04-19" },
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
    const html = renderHtml(document, resolveRenderProfile());

    expect(html).toContain("chemd-block--col");
    expect(html).toContain('data-columns="2"');
    expect(html).toContain("64-17-5");
    expect(html).toContain("rxn-a");
  });

  it("renders TLC plates only from typed graph normalization", () => {
    const document = createDocument(
      { id: "exp-html-tlc", title: "HTML TLC test", date: "2026-04-17" },
      {
        children: [{
          type: "analysis",
          id: "tlc-main",
          type_name: "tlc",
          data: "TLC",
          p1: "sm 0.82"
        }]
      }
    );
    const withoutTypedGraph = renderHtml(document, resolveRenderProfile());
    const withTypedGraph = renderHtml(document, resolveRenderProfile(), {
      typedGraph: {
        nodes: [{
          kind: "analysis",
          nodeId: "tlc-main",
          normalizedTlc: {
            lanes: [{
              lane_id: "p1",
              lane_label_raw: "sm",
              lane_role: "starting_material",
              spots: [{
                raw: "sm 0.82",
                rf_raw: "0.82",
                rf: 0.82,
                shape: "circle",
                size_rank: 3,
                intensity_rank: 3
              }],
              mess_regions: [],
              has_base: false,
              is_none: false
            }]
          }
        }]
      }
    });

    expect(withoutTypedGraph).not.toContain("chemd-tlc-plate");
    expect(withTypedGraph).toContain("chemd-tlc-plate");
  });
});
