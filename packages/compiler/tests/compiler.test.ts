import { describe, expect, it } from "vitest";

import type { MarkdownNode } from "@chemd/core";

import { compileChemd } from "../src";

describe("compileChemd", () => {
  it("wires parser, resolver, renderers, and render profile resolution together", () => {
    const source = `---
id: exp-compile
title: Compile Test
date: 2026-03-30
project: oxidation-study
render_profile: publication-acs
---

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
temperature: 200 °C
time: 4 h
:::

:::result #res-main
yield: 63%
:::

Yield: @res-main.yield and :chem[H2O]`;

    const result = compileChemd(source);
    const markdown = result.document.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("Yield:")
    );

    expect(result.document.meta.title).toBe("Compile Test");
    expect(result.renderOptions.profileId).toBe("publication-acs");
    expect(markdown?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(result.html).toContain("Compile Test");
    expect(result.html).toContain("chem-inline");
    expect(result.html).toContain("<svg");
    expect(result.html).toContain("chemd-svg chemd-svg--reaction");
    const payload = JSON.parse(result.json) as {
      render: {
        profileId: string;
        adapter?: {
          rdkit: { fixedBondLength: number };
        };
      };
    };

    expect(payload.render.profileId).toBe("publication-acs");
    expect(result.renderAdapterPayload.rdkit.fixedBondLength).toBe(result.renderOptions.structure.bondLength);
    expect(payload.render.adapter?.rdkit.fixedBondLength).toBe(result.renderOptions.structure.bondLength);
    const docxPayload = JSON.parse(result.docxBridge) as {
      render: { profileId: string };
      exportHints: { format: string };
    };
    expect(docxPayload.render.profileId).toBe("publication-acs");
    expect(docxPayload.exportHints.format).toBe("docx-bridge");
    expect(result.diagnostics).toEqual([]);
  });

  it("applies render overrides from frontmatter during compilation", () => {
    const source = `---
id: exp-compile-overrides
title: Compile Overrides Test
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 2.4
  export.margin: 20
---

Body.`;

    const result = compileChemd(source);

    expect(result.renderOptions.profileId).toBe("publication-acs");
    expect(result.renderOptions.structure.bondLineWidth).toBe(2.4);
    expect(result.renderOptions.export.margin).toBe(20);
    expect(result.diagnostics).toEqual([]);
  });

  it("allows compile-time render selection to override frontmatter profile and merge overrides", () => {
    const source = `---
id: exp-compile-runtime-selection
title: Compile Runtime Selection Test
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  export.margin: 14
---

Body.`;

    const result = compileChemd(source, {
      renderSelection: {
        profileId: "slides-large",
        overrides: {
          "structure.bondLength": 40
        }
      }
    });

    expect(result.renderOptions.profileId).toBe("slides-large");
    expect(result.renderOptions.structure.bondLength).toBe(40);
    expect(result.renderOptions.export.margin).toBe(14);
    expect(result.diagnostics).toEqual([]);
  });

  it("falls back to the default render profile and surfaces profile diagnostics", () => {
    const source = `---
id: exp-compile-profile
title: Compile Profile Fallback Test
date: 2026-03-30
render_profile: missing-profile
---

Body.`;

    const result = compileChemd(source);

    expect(result.renderOptions.profileId).toBe("eln-default");
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "W_UNKNOWN_RENDER_PROFILE",
        severity: "warning"
      })
    );
    expect(result.html).toContain('data-profile="eln-default"');
  });

  it("compiles template use expansion through the resolver", () => {
    const source = `---
id: exp-compile-template
title: Compile Template Test
date: 2026-03-30
primary_result: res-main
render_profile: eln-default
---

:::result #res-main
yield: 63%
:::

:::template quick-summary
bind: result=primary_result

Yield: @result.yield
:::

:::use quick-summary
:::`;

    const result = compileChemd(source);
    const expanded = result.document.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Yield: @result.yield"
    );

    expect(expanded?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(result.document.children.some((child) => child.type === "use")).toBe(false);
    expect(result.html).toContain("Yield:");
  });

  it("surfaces parser and render-profile diagnostics for invalid overrides", () => {
    const source = `---
id: exp-compile-invalid-override
title: Compile Invalid Override Test
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: thick
  structure.unknownField: 1
---

Body.`;

    const result = compileChemd(source);

    expect(result.renderOptions.profileId).toBe("publication-acs");
    expect(result.renderOptions.structure.bondLineWidth).toBe(1.4);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_INVALID_FRONTMATTER_VALUE",
        severity: "error"
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "E_INVALID_RENDER_PROFILE_VALUE",
        severity: "error"
      })
    );
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === "W_UNKNOWN_RENDER_PROFILE_FIELD")).toBe(false);
  });

  it("compiles col-x layout with nested mol block", () => {
    const source = `---
id: exp-compile-col
title: Compile Col Test
date: 2026-03-30
---

:::col-2
col: {:::mol
smiles: CCO
name: Ethanol
:::}
col: 63%
:::`;

    const result = compileChemd(source);

    expect(result.document.children.some((child) => child.type === "col")).toBe(true);
    expect(result.html).toContain('class="chemd-block chemd-block--col"');
    expect(result.html).toContain('data-columns="2"');
    expect(result.html).toContain("Ethanol");
    expect(result.html).toContain(">63%<");
  });

  it("renders markdown blockquote and code fence correctly in compile output", () => {
    const source = `---
id: exp-compile-markdown
title: Compile Markdown Blocks Test
date: 2026-03-30
---

:::result #res-main
yield: 63%
:::

> Yield note: @res-main.yield
>
> Formula: :chem[H2O]

\`\`\`text
@res-main.yield :chem[H2O]
\`\`\``;

    const result = compileChemd(source);
    const inlineChemMatches = result.html.match(/class="chem-inline"/g) ?? [];

    expect(result.html).toContain('<blockquote class="chemd-markdown-quote">');
    expect(result.html).toContain("Yield note: 63%");
    expect(result.html).toContain('<pre class="chemd-markdown-code"><code data-language="text">');
    expect(result.html).toContain("@res-main.yield :chem[H2O]");
    expect(inlineChemMatches).toHaveLength(1);
  });

  it("keeps blockquote-internal list semantics in compile output", () => {
    const source = `---
id: exp-compile-quote-list
title: Compile Quote List Test
date: 2026-03-30
---

:::result #res-main
yield: 63%
:::

> Checklist
> - [x] done @res-main.yield
> - [ ] todo
> > nested quote`;

    const result = compileChemd(source);
    const quoteMatches = result.html.match(/class="chemd-markdown-quote"/g) ?? [];

    expect(quoteMatches.length).toBeGreaterThanOrEqual(2);
    expect(result.html).toContain('<li class="chemd-task-item">');
    expect(result.html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled checked />');
    expect(result.html).toContain("done 63%");
    expect(result.html).toContain("nested quote");
  });
  it("keeps inline markdown semantics consistent in compile output", () => {
    const source = `---
id: exp-compile-inline
title: Compile Inline Markdown Test
date: 2026-03-30
---

:::result #res-main
yield: 63%
:::

Ref: @res-main.yield, style: *ital* **bold** ~~gone~~, code: \`@res-main.yield\`, code2: \`*no*\`, link: [**Spec**](https://example.com/docs), bad: [X](javascript:alert(1))

***`;

    const result = compileChemd(source);

    expect(result.html).toContain("Ref: 63%");
    expect(result.html).toContain('<code class="chemd-inline-code">@res-main.yield</code>');
    expect(result.html).toContain('<a class="chemd-link" href="https://example.com/docs" target="_blank" rel="noreferrer noopener"><strong>Spec</strong></a>');
    expect(result.html).toContain("<em>ital</em>");
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain("<del>gone</del>");
    expect(result.html).toContain('<code class="chemd-inline-code">*no*</code>');
    expect(result.html).not.toContain("<em>no</em>");
    expect(result.html).toContain('[X](javascript:alert(1))');
    expect(result.html).not.toContain('href="javascript:alert(1)"');
    expect(result.html).toContain('<hr class="chemd-markdown-hr" />');
  });

  it("renders nested lists and task items in compile output", () => {
    const source = `---
id: exp-compile-nested-list
title: Compile Nested List Test
date: 2026-03-30
---

- Parent item
  - [x] Done task
  - [ ] Pending task
3. Ordered parent
   2. Ordered child`;

    const result = compileChemd(source);
    const taskItems = result.html.match(/class="chemd-task-item"/g) ?? [];

    expect(result.html).toContain('<ul class="chemd-markdown-list"><li>Parent item<ul class="chemd-markdown-list">');
    expect(result.html).toContain('<ol class="chemd-markdown-list" start="3"><li>Ordered parent<ol class="chemd-markdown-list" start="2"><li>Ordered child</li></ol></li></ol>');
    expect(taskItems).toHaveLength(2);
    expect(result.html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled checked />');
    expect(result.html).toContain('<input class="chemd-task-checkbox" type="checkbox" disabled />');
  });
  it("keeps adapter payload contract consistent across compile outputs", () => {
    const source = `---
id: exp-compile-adapter-contract
title: Compile Adapter Contract Test
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLength: 36
  structure.bondLineWidth: 2
  reaction.arrowLength: 90
  reaction.componentGap: 22
  export.imageFormat: png
  export.dpi: 200
---

:::reaction #rxn-contract
reactants: A
products: B
:::`;

    const result = compileChemd(source);
    const payload = JSON.parse(result.json) as {
      render: {
        adapter?: typeof result.renderAdapterPayload;
      };
    };

    expect(payload.render.adapter).toEqual(result.renderAdapterPayload);
    expect(result.renderAdapterPayload.rdkit.fixedBondLength).toBe(result.renderOptions.structure.bondLength);
    expect(result.renderAdapterPayload.rdkit.bondLineWidth).toBe(result.renderOptions.structure.bondLineWidth);
    expect(result.renderAdapterPayload.rdkit.imageFormat).toBe(result.renderOptions.export.imageFormat);
    expect(result.renderAdapterPayload.rdkit.dpi).toBe(result.renderOptions.export.dpi);
    expect(result.html).toContain('x2="350"');
    expect(result.html).toContain('x="372" y="86"');
  });

  it("renders markdown table blocks in compile output", () => {
    const source = `---
id: exp-compile-table
title: Compile Table Test
date: 2026-03-31
---

| Name | Yield |
| --- | ---: |
| Run A | 63% |
| Run B | 58% |`;

    const result = compileChemd(source);

    expect(result.html).toContain('<table class="chemd-markdown-table">');
    expect(result.html).toContain('<th>Name</th>');
    expect(result.html).toContain('<th style="text-align:right">Yield</th>');
    expect(result.html).toContain('<td style="text-align:right">63%</td>');
  });

  it("includes docx markdown handoff content for bridge consumption", () => {
    const source = `---
id: exp-docx-md-handoff
title: DOCX Handoff
date: 2026-03-31
---

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
temperature: 200 °C
:::`;

    const result = compileChemd(source);
    const payload = JSON.parse(result.docxBridge) as {
      document: { meta: { title: string } };
      exportHints: { pipeline: string };
    };

    expect(payload.document.meta.title).toBe("DOCX Handoff");
    expect(payload.exportHints.pipeline).toBe("html-or-markdown-to-docx");
  });
});







