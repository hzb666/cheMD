import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import { resolveRenderProfile } from "@chemd/render-profile";

import { renderHtml } from "../src";

describe("renderHtml", () => {
  it("renders document header metadata while avoiding duplicate leading title headings", () => {
    const document = createDocument(
      {
        id: "exp-html",
        title: "HTML Test",
        date: "2026-03-30",
        time: "14:30",
        author: "zhibin hu",
        project: "oxidation-study"
      },
      {
        children: [
          createMarkdownNode(
            "# HTML Test\n\nFormula: :chem[H2O] and Yield: @meta.project",
            [],
            [{ type: "inline_chem", raw: ":chem[H2O]", value: "H2O" }]
          ),
          {
            type: "reaction",
            id: "rxn-main",
            name: "Oxidation step",
            reactants: ["CCO", "O=O"],
            products: ["CC(=O)O"],
            conditions: ["Cu catalyst", "air", "80 C", "4 h"],
            reagents: "TEMPO",
            pressure: "1 atm",
            atmosphere: "O2",
            temperature: "200 °C",
            time: "4 h",
            yield: "63%",
            conversion: "78%",
            selectivity: "91%",
            caption: "Main oxidation"
          },
          {
            type: "molecule",
            id: "mol-main",
            name: "Acetic acid",
            smiles: "CC(=O)O",
            role: "product",
            formula: "C2H4O2",
            amount: "1.2 g",
            equivalents: "1.0 eq"
          },
          {
            type: "result",
            id: "res-main",
            yield: "63%",
            conversion: "78%",
            selectivity: "91%",
            status: "completed",
            isolated_mass: "1.2 g",
            product_state: "liquid",
            purity: "98%",
            notes: "colorless"
          },
          {
            type: "analysis",
            id: "ana-main",
            type_name: "NMR",
            instrument: "Bruker 400",
            solvent: "CDCl3",
            frequency: "400 MHz",
            method: "1H",
            data: "7.26 ppm",
            notes: "clean spectrum"
          },
          {
            type: "procedure",
            id: "proc-main",
            ref: "rxn-main",
            body: "将底物溶于无水 THF，冰浴下缓慢滴加试剂。"
          },
          {
            type: "observation",
            id: "obs-main",
            ref: "proc-main",
            body: "滴加过程中体系由无色逐渐变为浅黄色，并有轻微放热。"
          },
          {
            type: "analysis",
            id: "ana-tlc",
            type_name: "tlc",
            ref: "proc-main",
            time: "0.5 h",
            eluent: "PE/EA = 4:1",
            plate: "silica gel GF254",
            visualization: "UV 254 nm",
            p1: "sm 0.60 ^5(4) | mess(0.10) 3(2)",
            result: "starting material mostly consumed"
          },
          {
            type: "sample",
            id: "sample-main",
            name: "Ethanol lot",
            sample_id: "S-01",
            batch: "B-22",
            purity: "99.5%",
            supplier: "Sigma",
            notes: "fresh bottle"
          },
          {
            type: "template",
            name: "quick-summary",
            bind: { result: "primary_result" },
            params: ["note"],
            description: "Summary block",
            body: []
          }
        ],
        diagnostics: [{ code: "W_TEST", severity: "warning", message: "example warning" }]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('data-profile="eln-default"');
    expect(html).toContain('<header class="chemd-document-header">');
    expect(html).toContain('<h1 class="chemd-document-title">HTML Test</h1>');
    expect(html).not.toContain('<h1 class="chemd-markdown chemd-markdown--h1">HTML Test</h1>');
    expect(html).toContain('<span class="chemd-document-meta-label">ID:</span>');
    expect(html).toContain('<span class="chemd-document-meta-value">exp-html</span>');
    expect(html).toContain('<span class="chemd-document-meta-label">Author:</span>');
    expect(html).toContain('<span class="chemd-document-meta-value">zhibin hu</span>');
    expect(html).toContain('<span class="chemd-document-meta-label">Date:</span>');
    expect(html).toContain('<span class="chemd-document-meta-value">2026-03-30</span>');
    expect(html).toContain('<span class="chemd-document-meta-label">Time:</span>');
    expect(html).toContain('<span class="chemd-document-meta-value">14:30</span>');
    expect(html).toContain("chem-inline");
    expect(html).toContain("chemd-block chemd-block--reaction");
    expect(html).toContain("chemd-block chemd-block--result");
    expect(html).toContain("<svg");
    expect(html).toContain('data-chem-render-state="loading"');
    expect(html).toContain("RDKit reaction rendering in progress");
    expect(html).toContain("Oxidation step");
    expect(html).toContain("TEMPO");
    expect(html).toContain("1 atm");
    expect(html).toContain("O2");
    expect(html).toContain(">Reaction <span class=\"chemd-block-id\">rxn-main</span></h2>");
    expect(html).toContain(">Molecule <span class=\"chemd-block-id\">mol-main</span></h2>");
    expect(html).toContain(">Result <span class=\"chemd-block-id\">res-main</span></h2>");
    expect(html).toContain(">Analysis <span class=\"chemd-block-id\">ana-main</span></h2>");
    expect(html).toContain(">Procedure <span class=\"chemd-block-id\">proc-main</span></h2>");
    expect(html).toContain(">Observation <span class=\"chemd-block-id\">obs-main</span></h2>");
    expect(html).toContain(">Sample <span class=\"chemd-block-id\">sample-main</span></h2>");
    expect(html).toContain('data-reactants="[');
    expect(html).toContain('data-products="[');
    expect(html).toContain('data-conditions="[');
    expect(html).not.toContain("<dt>Reactants</dt>");
    expect(html).not.toContain("<dt>Products</dt>");
    expect(html).not.toContain("<dt>Conditions</dt>");
    expect(html).not.toContain("<dt>SMILES</dt>");
    expect(html).not.toContain("<dt>ID</dt>");
    expect(html).toContain("91%");
    expect(html).toContain("Main oxidation");
    expect(html).toContain("Acetic acid");
    expect(html).toContain("1.0 eq");
    expect(html).toContain("1.2 g");
    expect(html).toContain("liquid");
    expect(html).toContain("colorless");
    expect(html).toContain("400 MHz");
    expect(html).toContain("1H");
    expect(html).toContain("clean spectrum");
    expect(html).toContain("chemd-block chemd-block--procedure");
    expect(html).toContain("chemd-block chemd-block--observation");
    expect(html).toContain("将底物溶于无水 THF，冰浴下缓慢滴加试剂。");
    expect(html).toContain("滴加过程中体系由无色逐渐变为浅黄色，并有轻微放热。");
    expect(html).toContain("PE/EA = 4:1");
    expect(html).toContain("silica gel GF254");
    expect(html).toContain("UV 254 nm");
    expect(html).toContain('class="chemd-block chemd-block--analysis chemd-block--analysis-tlc"');
    expect(html).toContain('class="chemd-tlc-lane-label">sm<');
    expect(html).not.toContain("sm 0.60 ^5(4) | mess(0.10) 3(2)");
    expect(html).toContain("starting material mostly consumed");
    expect(html).toContain("fresh bottle");
    expect(html).toContain("Summary block");
    expect(html).toContain("200 °C");
    expect(html).toContain("63%");
    expect(html).toContain("example warning");
  });

  it("renders tlc analyses as a plate with lane labels, baseline, solvent front, and shaped spots", () => {
    const document = createDocument(
      { id: "exp-tlc-html", title: "TLC Plate", date: "2026-04-11" },
      {
        children: [
          {
            type: "analysis",
            id: "ana-tlc-plate",
            type_name: "tlc",
            ref: "proc-main",
            time: "0.5 h",
            eluent: "PE/EA = 4:1",
            result: "pd dominant",
            p1: "sm 0.78 ^6(8) | mess(0.15) 4(2)",
            p2: "pd 0.43 3(5)",
            p3: "3 0.18 v2(1) | base"
          }
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('class="chemd-tlc"');
    expect(html).toContain('class="chemd-tlc-plate"');
    expect(html).toContain('style="--chemd-tlc-lane-count:3;"');
    expect(html).toContain('class="chemd-tlc-solvent-front"');
    expect(html).toContain('class="chemd-tlc-baseline"');
    expect(html).toContain('class="chemd-tlc-lane-label">sm<');
    expect(html).toContain('class="chemd-tlc-lane-label">pd<');
    expect(html).toContain('class="chemd-tlc-lane-label">3<');
    expect(html).toContain('class="chemd-tlc-spot"');
    expect(html).toContain('data-shape="up"');
    expect(html).toContain('data-shape="circle"');
    expect(html).toContain('data-shape="down"');
    expect(html).toContain('data-size-rank="5"');
    expect(html).toContain('data-intensity-rank="5"');
    expect(html).toContain('class="chemd-tlc-mess"');
    expect(html).toContain('class="chemd-tlc-base-spot"');
    expect(html).not.toContain("sm 0.78 ^6(8) | mess(0.15) 4(2)");
  });

  it("preserves explicit line breaks in procedure-style body text", () => {
    const document = createDocument(
      { id: "exp-procedure-breaks", title: "Procedure Breaks", date: "2026-04-14" },
      {
        children: [
          {
            type: "procedure",
            id: "proc-breaks",
            body: "First step.\nSecond step."
          }
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain("First step.<br />Second step.");
  });

  it("renders markdown headings, lists, and paragraphs with reference replacement", () => {
    const document = createDocument(
      { id: "exp-markdown", title: "Markdown Render", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "# Overview\n- Yield: @meta.yield\n- Formula: :chem[H2O]\n\n1. Step one\n2. Step two\n\nFinal note.",
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@meta.yield",
                source: "meta",
                field: "yield",
                resolution: { status: "resolved", value: "63%" }
              }
            ],
            [{ type: "inline_chem", raw: ":chem[H2O]", value: "H2O" }]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('<h1 class="chemd-markdown chemd-markdown--h1">Overview</h1>');
    expect(html).toContain('<ul class="chemd-markdown-list">');
    expect(html).toContain('<ol class="chemd-markdown-list">');
    expect(html).toContain("Yield: 63%");
    expect(html).toContain('data-chem="H2O"');
    expect(html).toContain('<p class="chemd-markdown">Final note.</p>');
  });

  it("renders nested lists and markdown task items", () => {
    const document = createDocument(
      { id: "exp-markdown-nested-list", title: "Markdown Nested List", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "- Parent item\n  - [x] Done task\n  - [ ] Pending task\n3. Ordered parent\n   2. Ordered child"
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));
    const taskItems = html.match(/class="chemd-task-item"/g) ?? [];

    expect(html).toContain('<ul class="chemd-markdown-list"><li>Parent item<ul class="chemd-markdown-list">');
    expect(html).toContain('<ol class="chemd-markdown-list" start="3"><li>Ordered parent<ol class="chemd-markdown-list" start="2"><li>Ordered child</li></ol></li></ol>');
    expect(taskItems).toHaveLength(2);
    expect(html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled checked />');
    expect(html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled />');
  });
  it("renders markdown blockquote and fenced code without inline replacement inside code", () => {
    const document = createDocument(
      { id: "exp-markdown-quote", title: "Markdown Quote", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            `> Yield note: @meta.project
>
> Inline: :chem[H2O]

\`\`\`ts
const sample = "@meta.project :chem[H2O]";
\`\`\``,
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@meta.project",
                source: "meta",
                field: "project",
                resolution: { status: "resolved", value: "oxidation-study" }
              }
            ],
            [{ type: "inline_chem", raw: ":chem[H2O]", value: "H2O" }]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));
    const inlineChemMatches = html.match(/class="chem-inline"/g) ?? [];

    expect(html).toContain('<blockquote class="chemd-markdown-quote">');
    expect(html).toContain("Yield note: oxidation-study");
    expect(html).toContain('<pre class="chemd-markdown-code"><code data-language="ts">');
    expect(html).toContain("const sample = &quot;@meta.project :chem[H2O]&quot;;");
    expect(inlineChemMatches).toHaveLength(1);
  });

  it("renders blockquote-internal lists and nested quote semantics", () => {
    const document = createDocument(
      { id: "exp-markdown-quote-list", title: "Markdown Quote List", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            `> Checklist
> - [x] done @meta.project
> - [ ] todo
> > nested quote`,
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@meta.project",
                source: "meta",
                field: "project",
                resolution: { status: "resolved", value: "oxidation-study" }
              }
            ]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));
    const quoteMatches = html.match(/class="chemd-markdown-quote"/g) ?? [];

    expect(quoteMatches.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('<li class="chemd-task-item">');
    expect(html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled checked />');
    expect(html).toContain("done oxidation-study");
    expect(html).toContain("nested quote");
  });
  it("renders inline code, links, and horizontal rules safely", () => {
    const document = createDocument(
      { id: "exp-markdown-inline", title: "Markdown Inline", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "Ref: @meta.project, style: *ital* **bold** ~~gone~~, code: `@meta.project`, code2: `*no*`, link: [**Spec**](https://example.com/docs), bad: [X](javascript:alert(1))\n\n---",
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@meta.project",
                source: "meta",
                field: "project",
                resolution: { status: "resolved", value: "oxidation-study" }
              }
            ]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain("Ref: oxidation-study");
    expect(html).toContain('<code class="chemd-inline-code">@meta.project</code>');
    expect(html).toContain('<a class="chemd-link" href="https://example.com/docs" target="_blank" rel="noreferrer noopener"><strong>Spec</strong></a>');
    expect(html).toContain("<em>ital</em>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<del>gone</del>");
    expect(html).toContain('<code class="chemd-inline-code">*no*</code>');
    expect(html).not.toContain("<em>no</em>");
    expect(html).toContain('[X](javascript:alert(1))');
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain('<hr class="chemd-markdown-hr" />');
  });


  it("prefers parser inline tokens for code and links when provided", () => {
    const document = createDocument(
      { id: "exp-markdown-token-path", title: "Markdown Token Path", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "Token code @@code@@, token link @@link@@, bad @@bad@@, normal @meta.project",
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@meta.project",
                source: "meta",
                field: "project",
                resolution: { status: "resolved", value: "oxidation-study" }
              }
            ],
            [],
            [{ type: "inline_code", raw: "@@code@@", value: "@meta.project", start: 11, end: 19 }],
            [
              {
                type: "markdown_link",
                raw: "@@link@@",
                label: "Spec",
                href: "https://example.com/token",
                safe: true,
                start: 32,
                end: 40
              },
              {
                type: "markdown_link",
                raw: "@@bad@@",
                label: "Bad",
                href: "javascript:alert(1)",
                safe: false,
                start: 46,
                end: 53
              }
            ]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('<code class="chemd-inline-code">@meta.project</code>');
    expect(html).toContain('<a class="chemd-link" href="https://example.com/token" target="_blank" rel="noreferrer noopener">Spec</a>');
    expect(html).toContain("normal oxidation-study");
    expect(html).toContain("@@bad@@");
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain("@@code@@");
    expect(html).not.toContain("@@link@@");
  });

  it("renders positioned reference and chem tokens without global raw replacement", () => {
    const document = createDocument(
      { id: "exp-markdown-positioned-ref-chem", title: "Markdown Positioned", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "@@ref@@ keep @@ref@@ and @@chem@@ keep @@chem@@",
            [
              {
                type: "reference",
                kind: "meta",
                raw: "@@ref@@",
                source: "meta",
                field: "project",
                start: 0,
                end: 7,
                resolution: { status: "resolved", value: "oxidation-study" }
              }
            ],
            [
              {
                type: "inline_chem",
                raw: "@@chem@@",
                value: "H2O",
                start: 25,
                end: 33
              }
            ]
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));
    const chemMatches = html.match(/class="chem-inline"/g) ?? [];

    expect(html).toContain("oxidation-study keep @@ref@@");
    expect(html).toContain('data-chem="H2O"');
    expect(chemMatches).toHaveLength(1);
    expect(html).toContain("keep @@chem@@");
  });
  it("keeps loading placeholder markup stable for reaction blocks", () => {
    const document = createDocument(
      { id: "exp-html-adapter", title: "HTML Adapter Test", date: "2026-03-30" },
      {
        children: [
          {
            type: "reaction",
            id: "rxn-adapter",
            reactants: ["A"],
            products: ["B"]
          }
        ]
      }
    );

    const options = resolveRenderProfile({ profileId: "eln-default" });
    const html = renderHtml(document, options);

    expect(html).toContain('data-chem-kind="reaction"');
    expect(html).toContain('data-chem-render-state="loading"');
  });

  it("renders markdown tables with alignment semantics", () => {
    const document = createDocument(
      { id: "exp-markdown-table", title: "Markdown Table", date: "2026-03-30" },
      {
        children: [
          createMarkdownNode(
            "| Name | Yield | Note |\n| :--- | ---: | :---: |\n| Run A | 63% | stable |\n| Run B | 58% | retry |"
          )
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('<table class="chemd-markdown-table">');
    expect(html).toContain("<thead><tr>");
    expect(html).toContain('<th style="text-align:left">Name</th>');
    expect(html).toContain('<th style="text-align:right">Yield</th>');
    expect(html).toContain('<th style="text-align:center">Note</th>');
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td style=\"text-align:right\">63%</td>");
  });

  it("renders col layout with nested molecule and text columns", () => {
    const document = createDocument(
      { id: "exp-col-html", title: "Col HTML Test", date: "2026-03-30" },
      {
        children: [
          {
            type: "col",
            columns: 2,
            children: [
              {
                type: "molecule",
                smiles: "CCO",
                name: "Ethanol"
              },
              createMarkdownNode("63%")
            ]
          }
        ]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain('class="chemd-block chemd-block--col"');
    expect(html).toContain('data-columns="2"');
    expect(html).toContain('class="chemd-col-grid"');
    expect(html).toContain('class="chemd-col-item"');
    expect(html).toContain("chemd-block chemd-block--molecule");
    expect(html).toContain(">63%<");
  });
});










