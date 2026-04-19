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

  it("keeps machine metadata out of visible fields and renders readable procedure steps", () => {
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
            ref: "rxn-main",
            steps: [{
              type: "step",
              stepId: "heat-main",
              family: "heat",
              params: { temperature: "80 C", duration: "4 h" },
              inputs: ["A"],
              outputs: ["intermediate"]
            }, {
              type: "step",
              stepId: "analyze-main",
              family: "analyze",
              params: { analysisType: "tlc" },
              dependsOn: ["heat-main"]
            }, {
              type: "step",
              stepId: "review-main",
              family: "hold",
              params: {},
              dependsOn: ["missing-step"]
            }]
          },
          {
            type: "analysis",
            id: "tlc-main",
            type_name: "tlc",
            ref: "rxn-main"
          }
        ]
      }
    );
    const html = renderHtml(document, resolveRenderProfile());

    expect(html).not.toContain("data-source-origin");
    expect(html).not.toContain("data-declared-kind");
    expect(html).not.toContain("data-ref");
    expect(html).not.toContain("Surface origin");
    expect(html).not.toContain("Declared kind");
    expect(html).not.toContain("<dt>Ref</dt>");
    expect(html).toContain("<dt>Related</dt><dd>rxn-main</dd>");
    expect(html).toContain('<span class="chemd-block-id">rxn-main</span>');
    expect(html).toContain('<span class="chemd-block-id">proc-main</span>');
    expect(html).toContain('<span class="chemd-block-id">tlc-main</span>');
    expect(html).toContain("chemd-procedure-steps");
    expect(html).toContain("Step 1: Heat");
    expect(html).toContain("<dt>Temperature</dt><dd>80 C</dd>");
    expect(html).toContain("<dt>Duration</dt><dd>4 h</dd>");
    expect(html).toContain("<dt>Uses</dt><dd>A</dd>");
    expect(html).toContain("<dt>Produces</dt><dd>intermediate</dd>");
    expect(html).toContain("Step 2: Analyze");
    expect(html).toContain("<dt>Analysis type</dt><dd>TLC</dd>");
    expect(html).toContain("<dt>After</dt><dd>Step 1</dd>");
    expect(html).toContain("Step 3: Hold");
    expect(html).toContain("<dt>After</dt><dd>missing-step</dd>");
    expect(html).not.toContain("temperature=80 C");
    expect(html).not.toContain("depends_on=heat-main");
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
