import { describe, expect, it } from "vitest";

import type { MarkdownNode } from "@chemd/core";

import { parseChemd } from "../../parser/src";

import { resolveChemd } from "../src";

describe("resolveChemd", () => {
  it("builds an object index, resolves references, and reports duplicate ids", () => {
    const doc = parseChemd(`---
id: exp-1
title: Resolver Test
date: 2026-03-30
project: oxidation-study
---

:::result #res-main
yield: 63%
:::

:::result #res-main
conversion: 78%
:::

The isolated yield was @res-main.yield in @meta.project.`);

    const resolved = resolveChemd(doc);
    const markdown = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("isolated yield")
    );
    const duplicate = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_DUPLICATE_ID");

    expect(duplicate).toBeDefined();
    expect(markdown?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(markdown?.references[1]?.resolution).toMatchObject({ status: "resolved", value: "oxidation-study" });
  });

  it("reports missing required fields and unresolved references", () => {
    const doc = parseChemd(`---
id: exp-2
title: Validation Test
date: 2026-03-30
---

:::reaction #rxn-main
reactants: CCO | O=O
:::

Unknown result: @res-main.yield`);

    const resolved = resolveChemd(doc);
    const missingField = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_MISSING_REQUIRED_FIELD");
    const unresolved = resolved.diagnostics.find((diagnostic) => diagnostic.code === "W_UNRESOLVED_REFERENCE");

    expect(missingField?.message).toContain("products");
    expect(unresolved?.message).toContain("@res-main.yield");
  });

  it("reports invalid primary object references from frontmatter", () => {
    const doc = parseChemd(`---
id: exp-2b
title: Primary Reference Test
date: 2026-03-30
primary_result: res-missing
---

:::template quick-summary
bind: result=primary_result

Yield: @result.yield
:::

:::use quick-summary
:::`);

    const resolved = resolveChemd(doc);
    const invalidPrimary = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_INVALID_PRIMARY_REFERENCE");

    expect(invalidPrimary?.message).toContain("primary_result");
    expect(invalidPrimary?.message).toContain("res-missing");
  });

  it("expands use blocks and resolves alias plus param references from template context", () => {
    const doc = parseChemd(`---
id: exp-3
title: Template Expansion Test
date: 2026-03-30
primary_reaction: rxn-main
primary_result: res-main
---

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
temperature: 200 °C
:::

:::result #res-main
yield: 63%
:::

:::template quick-summary
bind: reaction=primary_reaction | result=primary_result
params: note

Temperature: @reaction.temperature
Yield: @result.yield
Note: @param.note
:::

:::use quick-summary
note: stable run
:::`);

    const resolved = resolveChemd(doc);
    const expanded = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("Temperature:")
    );

    expect(expanded).toBeDefined();
    expect(expanded?.references).toHaveLength(3);
    expect(expanded?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "200 °C" });
    expect(expanded?.references[1]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(expanded?.references[2]?.resolution).toMatchObject({ status: "resolved", value: "stable run" });
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
  });

  it("does not emit unresolved param diagnostics for template definitions before use expansion", () => {
    const doc = parseChemd(`---
id: exp-3a
title: Template Param Definition Test
date: 2026-03-30
---

:::template quick-summary
params: note

Note: @param.note
:::
`);

    const resolved = resolveChemd(doc);
    const unresolvedParam = resolved.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "W_UNRESOLVED_REFERENCE" &&
        diagnostic.message.includes("@param.note")
    );

    expect(unresolvedParam).toBeUndefined();
  });

  it("expands nested use blocks inside template bodies", () => {
    const doc = parseChemd(`---
id: exp-3b
title: Nested Template Expansion Test
date: 2026-03-30
primary_result: res-main
---

:::result #res-main
yield: 63%
:::

:::template child-summary
bind: result=primary_result

Child yield: @result.yield
:::

:::template parent-summary
Parent start.

:::use child-summary
:::

Parent end.
:::

:::use parent-summary
:::`);

    const resolved = resolveChemd(doc);
    const childYield = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Child yield: @result.yield"
    );
    const parentStart = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Parent start."
    );
    const parentEnd = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Parent end."
    );

    expect(parentStart).toBeDefined();
    expect(parentEnd).toBeDefined();
    expect(childYield?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
  });

  it("lets use block alias overrides win over template bind sources", () => {
    const doc = parseChemd(`---
id: exp-4
title: Alias Override Test
date: 2026-03-30
primary_result: res-main
---

:::result #res-main
yield: 63%
:::

:::result #res-override
yield: 91%
:::

:::template quick-summary
bind: result=primary_result

Yield: @result.yield
:::

:::use quick-summary
result: res-override
:::`);

    const resolved = resolveChemd(doc);
    const expanded = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Yield: @result.yield"
    );

    expect(expanded?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "91%" });
  });

  it("reports unknown templates and drops unresolved use nodes from output", () => {
    const doc = parseChemd(`---
id: exp-5
title: Unknown Template Test
date: 2026-03-30
---

:::use missing-template
note: ignored
:::

After use block.`);

    const resolved = resolveChemd(doc);
    const unknownTemplate = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_UNKNOWN_TEMPLATE");

    expect(unknownTemplate?.message).toContain("missing-template");
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
    expect(resolved.children.some((child) => child.type === "markdown" && child.value.includes("After use block"))).toBe(true);
  });

  it("reports duplicate template names and keeps the first definition stable", () => {
    const doc = parseChemd(`---
id: exp-6
title: Duplicate Template Test
date: 2026-03-30
primary_result: res-main
---

:::result #res-main
yield: 63%
:::

:::template quick-summary
bind: result=primary_result

Yield: @result.yield
:::

:::template quick-summary
bind: result=primary_result

Yield duplicate: @result.yield
:::

:::use quick-summary
:::`);

    const resolved = resolveChemd(doc);
    const duplicateTemplate = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_DUPLICATE_TEMPLATE");
    const expanded = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Yield: @result.yield"
    );

    expect(duplicateTemplate?.message).toContain("quick-summary");
    expect(expanded?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
    expect(
      resolved.children.some(
        (child): child is MarkdownNode => child.type === "markdown" && child.value === "Yield duplicate: @result.yield"
      )
    ).toBe(false);
  });

  it("does not validate unused template body objects as top-level document objects", () => {
    const doc = parseChemd(`---
id: exp-6a
title: Template Body Scope Test
date: 2026-03-30
---

:::template molecule-fragment
:::molecule #mol-template
name: Template molecule only
:::
:::
`);

    const resolved = resolveChemd(doc);
    const missingField = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_MISSING_REQUIRED_FIELD");
    const duplicateId = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_DUPLICATE_ID");

    expect(missingField).toBeUndefined();
    expect(duplicateId).toBeUndefined();
  });

  it("reports duplicate ids introduced by repeated template expansion", () => {
    const doc = parseChemd(`---
id: exp-6b
title: Template Expansion Duplicate Id Test
date: 2026-03-30
---

:::template molecule-fragment
:::molecule #mol-template
smiles: CCO
:::
:::

:::use molecule-fragment
:::

:::use molecule-fragment
:::
`);

    const resolved = resolveChemd(doc);
    const duplicateId = resolved.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_DUPLICATE_ID" &&
        diagnostic.message.includes("mol-template")
    );

    expect(duplicateId).toBeDefined();
  });

  it("reports template cycles and keeps unrelated content renderable", () => {
    const doc = parseChemd(`---
id: exp-7
title: Template Cycle Test
date: 2026-03-30
---

:::template template-a
:::use template-b
:::
:::

:::template template-b
:::use template-a
:::
:::

:::use template-a
:::

After cycle block.`);

    const resolved = resolveChemd(doc);
    const cycle = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_TEMPLATE_CYCLE");

    expect(cycle?.message).toContain("template-a");
    expect(cycle?.message).toContain("template-b");
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
    expect(resolved.children.some((child) => child.type === "markdown" && child.value === "After cycle block.")).toBe(true);
  });

  it("handles prototype-backed template names safely", () => {
    const doc = parseChemd(`---
id: exp-8
title: Prototype Template Name Test
date: 2026-03-30
---

:::use toString
:::

After unsafe template name.`);

    const resolved = resolveChemd(doc);
    const unknownTemplate = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_UNKNOWN_TEMPLATE");

    expect(unknownTemplate?.message).toContain("toString");
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
    expect(
      resolved.children.some(
        (child): child is MarkdownNode => child.type === "markdown" && child.value === "After unsafe template name."
      )
    ).toBe(true);
  });

  it("resolves references for ids that overlap with Object.prototype keys", () => {
    const doc = parseChemd(`---
id: exp-9
title: Prototype Object Id Test
date: 2026-03-30
---

:::result #toString
yield: 63%
:::

Yield: @toString.yield`);

    const resolved = resolveChemd(doc);
    const markdown = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value === "Yield: @toString.yield"
    );
    const duplicateId = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_DUPLICATE_ID");

    expect(duplicateId).toBeUndefined();
    expect(markdown?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
  });

  it("limits deep template expansion to avoid DoS", () => {
    const depth = 40;
    const templates = Array.from({ length: depth }, (_, index) => {
      const current = `t-${index}`;
      const next = `t-${index + 1}`;

      if (index === depth - 1) {
        return `:::template ${current}\nTail block.\n:::`;
      }

      return `:::template ${current}\n:::use ${next}\n:::\n:::`;
    }).join("\n\n");

    const doc = parseChemd(`---
id: exp-10
title: Expansion Limit Test
date: 2026-03-30
---

${templates}

:::use t-0
:::

After expansion.`);

    const resolved = resolveChemd(doc);
    const limit = resolved.diagnostics.find((diagnostic) => diagnostic.code === "E_TEMPLATE_EXPANSION_LIMIT");

    expect(limit).toBeDefined();
    expect(resolved.children.some((child) => child.type === "use")).toBe(false);
    expect(
      resolved.children.some((child): child is MarkdownNode => child.type === "markdown" && child.value === "After expansion.")
    ).toBe(true);
  });

  it("resolves nested references inside col blocks", () => {
    const doc = parseChemd(`---
id: exp-col-resolve
title: Col Resolve Test
date: 2026-03-30
---

:::result #res-main
yield: 63%
:::

:::col-2
col: Yield
col: @res-main.yield
:::
`);

    const resolved = resolveChemd(doc);
    const col = resolved.children.find((child) => child.type === "col");
    const colMarkdown = col?.type === "col"
      ? col.children.find(
          (child): child is MarkdownNode => child.type === "markdown" && child.value === "@res-main.yield"
        )
      : undefined;

    expect(col?.type).toBe("col");
    expect(colMarkdown?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "63%" });
  });

  it("resolves primary molecule and primary analysis aliases inside templates", () => {
    const doc = parseChemd(`---
id: exp-new-primary-aliases
title: New Primary Aliases
date: 2026-04-02
primary_molecule: mol-main
primary_analysis: ana-main
---

:::molecule #mol-main
smiles: CCO
:::

:::analysis #ana-main
type: 1H NMR
data: 7.21 (d, 2H)
:::

:::template quick-summary
bind: molecule=primary_molecule | analysis=primary_analysis

SMILES: @molecule.smiles
Data: @analysis.data
:::

:::use quick-summary
:::`);

    const resolved = resolveChemd(doc);
    const expanded = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("SMILES:")
    );

    expect(expanded?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "CCO" });
    expect(expanded?.references[1]?.resolution).toMatchObject({
      status: "resolved",
      value: "7.21 (d, 2H)"
    });
  });

  it("resolves default molecule and analysis aliases from primary frontmatter", () => {
    const doc = parseChemd(`---
id: exp-default-primary-aliases
title: Default Primary Aliases
date: 2026-04-02
primary_molecule: mol-main
primary_analysis: ana-main
---

:::molecule #mol-main
smiles: CCO
:::

:::analysis #ana-main
type: 1H NMR
data: 7.21 (d, 2H)
:::

SMILES: @molecule.smiles
Data: @analysis.data`);

    const resolved = resolveChemd(doc);
    const markdown = resolved.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("SMILES:")
    );

    expect(markdown?.references[0]?.resolution).toMatchObject({ status: "resolved", value: "CCO" });
    expect(markdown?.references[1]?.resolution).toMatchObject({
      status: "resolved",
      value: "7.21 (d, 2H)"
    });
    expect(
      resolved.diagnostics.find(
        (diagnostic) => diagnostic.code === "W_UNRESOLVED_REFERENCE" && diagnostic.message.includes("@molecule.smiles")
      )
    ).toBeUndefined();
  });
});

