import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import { mapRenderOptionsToAdapterPayload, resolveRenderProfile } from "@chemd/render-profile";

import { renderHtml } from "../src";

describe("renderHtml", () => {
  it("renders document metadata, markdown, diagnostics, inline chemistry, and structured blocks", () => {
    const document = createDocument(
      { id: "exp-html", title: "HTML Test", date: "2026-03-30", project: "oxidation-study" },
      {
        children: [
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
          },
          createMarkdownNode(
            "Formula: :chem[H2O] and Yield: @meta.project",
            [],
            [{ type: "inline_chem", raw: ":chem[H2O]", value: "H2O" }]
          )
        ],
        diagnostics: [{ code: "W_TEST", severity: "warning", message: "example warning" }]
      }
    );

    const html = renderHtml(document, resolveRenderProfile({ profileId: "eln-default" }));

    expect(html).toContain("HTML Test");
    expect(html).toContain('data-profile="eln-default"');
    expect(html).toContain("chem-inline");
    expect(html).toContain("chemd-block chemd-block--reaction");
    expect(html).toContain("chemd-block chemd-block--result");
    expect(html).toContain("<svg");
    expect(html).toContain("chemd-svg chemd-svg--reaction");
    expect(html).toContain("Oxidation step");
    expect(html).toContain("TEMPO");
    expect(html).toContain("1 atm");
    expect(html).toContain("O2");
    expect(html).toContain("Cu catalyst | air | 80 C | 4 h");
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
    expect(html).toContain("fresh bottle");
    expect(html).toContain("Summary block");
    expect(html).toContain("200 °C");
    expect(html).toContain("63%");
    expect(html).toContain("example warning");
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
  it("uses provided adapter payload for embedded SVG rendering", () => {
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
    const adapterPayload = mapRenderOptionsToAdapterPayload(resolveRenderProfile({ profileId: "slides-large" }));
    const html = renderHtml(document, options, adapterPayload);

    expect(html).toContain('x2="324"');
    expect(html).toContain('x="344" y="86"');
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










