import { describe, expect, it } from "vitest";

import type { ColNode, MarkdownNode, MoleculeNode, ReactionNode, ResultNode, TemplateNode, UseNode } from "@chemd/core";

import { parseChemd } from "../src";

type PositionedMarkdownToken = {
  raw: string;
  start?: number;
  end?: number;
  startLine?: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

const getLineColumnFromOffset = (value: string, offset: number): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < offset; index += 1) {
    if (value.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    column: offset - lineStart + 1
  };
};

const expectTokenSpan = (value: string, token: PositionedMarkdownToken): void => {
  expect(typeof token.start).toBe("number");
  expect(typeof token.end).toBe("number");

  const start = token.start ?? 0;
  const end = token.end ?? 0;

  expect(value.slice(start, end)).toBe(token.raw);

  const startLocation = getLineColumnFromOffset(value, start);
  const endLocation = getLineColumnFromOffset(value, end);

  expect(token.startLine).toBe(startLocation.line);
  expect(token.startColumn).toBe(startLocation.column);
  expect(token.endLine).toBe(endLocation.line);
  expect(token.endColumn).toBe(endLocation.column);
};

describe("parseChemd", () => {
  it("parses frontmatter, semantic blocks, and markdown references", () => {
    const source = `---
id: exp-2026-03-30-001
title: Ethanol oxidation
date: 2026-03-30
project: oxidation-study
render_profile: publication-acs
---

# Experiment

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
temperature: 200 °C
time: 4 h
:::

:::result #res-main
yield: 63%
conversion: 78%
:::

The isolated yield was @res-main.yield for @meta.project.`;

    const doc = parseChemd(source);
    const reaction = doc.children.find(
      (child): child is ReactionNode => child.type === "reaction"
    );
    const result = doc.children.find(
      (child): child is ResultNode => child.type === "result"
    );
    const markdown = doc.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("isolated yield")
    );

    expect(doc.meta.project).toBe("oxidation-study");
    expect(reaction).toMatchObject({
      type: "reaction",
      id: "rxn-main",
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["Cu catalyst", "air", "80 C", "4 h"],
      temperature: "200 °C",
      time: "4 h"
    });
    expect(result).toMatchObject({
      type: "result",
      id: "res-main",
      yield: "63%",
      conversion: "78%"
    });
    expect(markdown?.references).toHaveLength(2);
    expect(markdown?.references[0]).toMatchObject({ kind: "object_field", source: "res-main", field: "yield" });
    expect(markdown?.references[1]).toMatchObject({ kind: "meta", field: "project" });
    for (const ref of markdown?.references ?? []) {
      expectTokenSpan(markdown?.value ?? "", ref);
    }
  });

  it("parses frontmatter arrays and primary object metadata", () => {
    const source = `---
id: exp-frontmatter
title: Frontmatter Test
date: 2026-03-30
project: oxidation-study
primary_reaction: rxn-main
primary_result: res-main
tags:
  - oxidation
  - copper
render_profile: publication-acs
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.meta.primary_reaction).toBe("rxn-main");
    expect(doc.meta.primary_result).toBe("res-main");
    expect(doc.meta.tags).toEqual(["oxidation", "copper"]);
    expect(doc.renderSelection).toEqual({ profileId: "publication-acs" });
  });

  it("parses inline frontmatter arrays for tags", () => {
    const source = `---
id: exp-inline-tags
title: Inline Tags Test
date: 2026-03-30
tags: [oxidation, "copper catalyst"]
render_profile: publication-acs
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.meta.tags).toEqual(["oxidation", "copper catalyst"]);
    expect(doc.renderSelection).toEqual({ profileId: "publication-acs" });
  });

  it("keeps non-tags bracket values as plain strings", () => {
    const source = `---
id: exp-non-tags-brackets
title: [Draft]
date: 2026-03-30
tags: [oxidation]
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.meta.title).toBe("[Draft]");
    expect(doc.meta.tags).toEqual(["oxidation"]);
  });
  it("parses inline frontmatter arrays with quoted commas and escaped quotes", () => {
    const source = `---
id: exp-inline-tags-quoted
title: Inline Tags Quoted Test
date: 2026-03-30
tags: ["copper, catalyst", 'nickel, ligand', 'quoted "value"']
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.meta.tags).toEqual(["copper, catalyst", "nickel, ligand", "quoted \"value\""]);
  });
  it("parses render overrides from frontmatter", () => {
    const source = `---
id: exp-render-overrides
title: Render Overrides Test
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 2.1
  reaction.showConditionsBelowArrow: false
  export.margin: 16
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.renderSelection).toEqual({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLineWidth": 2.1,
        "reaction.showConditionsBelowArrow": false,
        "export.margin": 16
      }
    });
  });

  it("parses template and use blocks with body references", () => {
    const source = `---
id: exp-template
title: Template Test
date: 2026-03-30
primary_reaction: rxn-main
primary_result: res-main
---

:::template quick-summary
bind: reaction=primary_reaction | result=primary_result
params: note

## Quick Summary

Temperature: @reaction.temperature
Yield: @result.yield
Note: @param.note
:::

:::use quick-summary
note: stable run
:::`;

    const doc = parseChemd(source);
    const template = doc.children.find(
      (child): child is TemplateNode => child.type === "template"
    );
    const useNode = doc.children.find(
      (child): child is UseNode => child.type === "use"
    );

    expect(template?.bind).toEqual({ reaction: "primary_reaction", result: "primary_result" });
    expect(template?.params).toEqual(["note"]);
    expect(template?.body[0]).toMatchObject({ type: "markdown" });
    expect(template?.body[0] && "references" in template.body[0] ? template.body[0].references : []).toHaveLength(3);
    expect(template?.body[0] && "references" in template.body[0] ? template.body[0].references[0] : undefined).toMatchObject({ kind: "alias_field", source: "reaction", field: "temperature" });
    expect(template?.body[0] && "references" in template.body[0] ? template.body[0].references[2] : undefined).toMatchObject({ kind: "param_field", source: "param", field: "note" });
    expect(useNode?.values).toEqual({ note: "stable run" });
  });

  it("parses nested use blocks inside template bodies", () => {
    const source = `---
id: exp-template-nested
title: Nested Template Test
date: 2026-03-30
---

:::template parent-summary
Intro line.

:::use child-summary
note: nested run
:::

Outro line.
:::`;

    const doc = parseChemd(source);
    const template = doc.children.find(
      (child): child is TemplateNode => child.type === "template"
    );

    expect(template?.body).toHaveLength(3);
    expect(template?.body[0]).toMatchObject({ type: "markdown", value: "Intro line." });
    expect(template?.body[1]).toMatchObject({ type: "use", template: "child-summary", values: { note: "nested run" } });
    expect(template?.body[2]).toMatchObject({ type: "markdown", value: "Outro line." });
  });

  it("parses col-x blocks with nested brace components", () => {
    const source = `---
id: exp-col-layout
title: Col Layout Test
date: 2026-03-30
---

:::col-2
col: {:::mol
smiles: CCO
name: Ethanol
:::}
col: 63%
:::`;

    const doc = parseChemd(source);
    const col = doc.children.find((child): child is ColNode => child.type === "col");
    const molecule = col?.children.find((child): child is MoleculeNode => child.type === "molecule");
    const textCol = col?.children.find((child): child is MarkdownNode => child.type === "markdown");

    expect(col?.columns).toBe(2);
    expect(col?.children).toHaveLength(2);
    expect(molecule).toMatchObject({ type: "molecule", smiles: "CCO", name: "Ethanol" });
    expect(textCol?.value).toBe("63%");
  });

  it("emits diagnostics for col-x count mismatches and invalid child lines", () => {
    const source = `---
id: exp-col-layout-invalid
title: Col Layout Invalid Test
date: 2026-03-30
---

:::col-2
plain line
col: 63%
:::`;

    const doc = parseChemd(source);
    const invalidLine = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_INVALID_COL_CHILD");
    const countMismatch = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_COL_COUNT_MISMATCH");

    expect(invalidLine?.message).toContain("plain line");
    expect(countMismatch?.message).toContain("expected 2");
  });

  it("emits diagnostics for unterminated structured blocks", () => {
    const source = `---
id: exp-unclosed-block
title: Unterminated Block Test
date: 2026-03-30
---

:::reaction #rxn-main
reactants: CCO | O=O
products: CC(=O)O`;

    const doc = parseChemd(source);
    const unterminated = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_UNTERMINATED_BLOCK");

    expect(unterminated?.message).toContain("reaction");
  });

  it("rejects numeric suffixes on non-col blocks", () => {
    const source = `---
id: exp-invalid-block-suffix
title: Invalid Block Suffix Test
date: 2026-04-02
---

:::result-2 #res-main
yield: 63%
:::`;

    const doc = parseChemd(source);
    const unknownBlock = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_UNKNOWN_BLOCK");
    const resultNode = doc.children.find((child) => child.type === "result");

    expect(unknownBlock?.message).toContain("result-2");
    expect(resultNode).toBeUndefined();
  });

  it("parses inline chemistry and emits parser diagnostics for invalid fields and list items", () => {
    const source = `---
id: exp-diagnostics
title: Diagnostic Test
date: 2026-03-30
---

:::reaction #rxn-main
reactants: CCO |  | O=O
products: CC(=O)O
bond_length: 32
:::

Formula: :chem[H2O]`;

    const doc = parseChemd(source);
    const markdown = doc.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("Formula:")
    );
    const unknownField = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_UNKNOWN_FIELD");
    const invalidListItem = doc.diagnostics.find((diagnostic) => diagnostic.code === "E_INVALID_LIST_ITEM");

    expect(markdown?.inlineChem).toHaveLength(1);
    expect(markdown?.inlineChem[0]).toMatchObject({ raw: ":chem[H2O]", value: "H2O" });
    expectTokenSpan(markdown?.value ?? "", markdown?.inlineChem[0] ?? { raw: ":chem[H2O]" });
    expect(unknownField?.message).toContain("bond_length");
    expect(invalidListItem?.message).toContain("reactants");
  });

  it("parses reaction conditions as a formal list field", () => {
    const source = `---
id: exp-reaction-conditions
title: Reaction Conditions
date: 2026-04-02
---

:::reaction #rxn-main
reactants: CCO
products: CC(=O)O
conditions: Cu catalyst | air | 80 C | 4 h
:::`;

    const doc = parseChemd(source);
    const reaction = doc.children.find((child): child is ReactionNode => child.type === "reaction");

    expect(reaction?.conditions).toEqual(["Cu catalyst", "air", "80 C", "4 h"]);
  });


  it("tokenizes inline code and markdown links, and warns on unsafe href", () => {
    const source = `---
id: exp-markdown-inline-tokens
title: Markdown Inline Tokens
date: 2026-03-30
---

Ref: \`@meta.project\` [Spec](https://example.com/docs) [X](javascript:alert(1))`;

    const doc = parseChemd(source);
    const markdown = doc.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("Ref:")
    );
    const unsafeHref = doc.diagnostics.find(
      (diagnostic) => diagnostic.code === "W_UNSAFE_LINK_HREF"
    );

    expect(markdown?.inlineCode).toHaveLength(1);
    expect(markdown?.inlineCode[0]).toMatchObject({ raw: "`@meta.project`", value: "@meta.project" });
    expect(markdown?.inlineCode[0]?.start).toBe(markdown?.value.indexOf("`@meta.project`"));
    expect(markdown?.inlineCode[0]?.end).toBe((markdown?.inlineCode[0]?.start ?? 0) + "`@meta.project`".length);
    expectTokenSpan(markdown?.value ?? "", markdown?.inlineCode[0] ?? { raw: "`@meta.project`" });
    expect(markdown?.links).toHaveLength(2);
    expect(markdown?.links[0]).toMatchObject({ label: "Spec", href: "https://example.com/docs", safe: true });
    expect(markdown?.links[1]).toMatchObject({ label: "X", href: "javascript:alert(1)", safe: false });
    for (const link of markdown?.links ?? []) {
      expectTokenSpan(markdown?.value ?? "", link);
    }
    expect(unsafeHref?.message).toContain("javascript:alert(1)");
  });

  it("tracks line and column spans for markdown tokens in multiline content", () => {
    const source = `---
id: exp-markdown-multiline-spans
title: Multiline Span Test
date: 2026-03-30
---

First line @meta.title
Second line :chem[H2O] and \`@meta.project\` with [Spec](https://example.com/docs)
Third line @meta.date`;

    const doc = parseChemd(source);
    const markdown = doc.children.find(
      (child): child is MarkdownNode => child.type === "markdown" && child.value.includes("First line")
    );

    expect(markdown).toBeDefined();

    for (const ref of markdown?.references ?? []) {
      expectTokenSpan(markdown?.value ?? "", ref);
    }

    for (const chem of markdown?.inlineChem ?? []) {
      expectTokenSpan(markdown?.value ?? "", chem);
    }

    for (const code of markdown?.inlineCode ?? []) {
      expectTokenSpan(markdown?.value ?? "", code);
    }

    for (const link of markdown?.links ?? []) {
      expectTokenSpan(markdown?.value ?? "", link);
    }

    const dateReference = markdown?.references.find((token) => token.raw === "@meta.date");
    expect(dateReference).toMatchObject({
      startLine: 3,
      startColumn: 12,
      endLine: 3,
      endColumn: 22
    });
  });
  it("emits diagnostics for invalid frontmatter lines and keeps parsing the document", () => {
    const source = `---
id: exp-frontmatter-diagnostics
title: Frontmatter Diagnostic Test
date: 2026-03-30
not a valid line
project: oxidation-study
---

Body.`;

    const doc = parseChemd(source);
    const invalidLine = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_INVALID_FRONTMATTER_LINE");

    expect(doc.meta.project).toBe("oxidation-study");
    expect(invalidLine?.message).toContain("not a valid line");
  });
  it("warns on duplicate frontmatter keys and uses the last value", () => {
    const source = `---
id: exp-dup-title
title: First Title
date: 2026-03-30
title: Final Title
---

Body.`;

    const doc = parseChemd(source);
    const duplicateKey = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_DUPLICATE_FRONTMATTER_KEY");

    expect(doc.meta.title).toBe("Final Title");
    expect(duplicateKey?.message).toContain("title");
  });

  it("reports invalid required frontmatter value types", () => {
    const source = `---
id: exp-invalid-primary
title: Invalid Primary
date: 2026-03-30
primary_result:
  value: res-main
---

Body.`;

    const doc = parseChemd(source);
    const invalidValue = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("primary_result")
    );

    expect(doc.meta.primary_result).toBeUndefined();
    expect(invalidValue).toBeDefined();
  });

  it("reports missing required frontmatter keys", () => {
    const source = `---
title: Missing Required Keys
author: parser-test
---

Body.`;

    const doc = parseChemd(source);
    const missingId = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_MISSING_REQUIRED_FRONTMATTER_KEY" &&
        diagnostic.message.includes("id")
    );
    const missingDate = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_MISSING_REQUIRED_FRONTMATTER_KEY" &&
        diagnostic.message.includes("date")
    );

    expect(doc.meta.id).toBe("draft-document");
    expect(doc.meta.date).toBe("1970-01-01");
    expect(missingId).toBeDefined();
    expect(missingDate).toBeDefined();
  });
  it("warns when frontmatter date is not ISO YYYY-MM-DD", () => {
    const source = `---
id: exp-non-iso-date
title: Non ISO Date
date: 2026/03/30
---

Body.`;

    const doc = parseChemd(source);
    const nonIsoDate = doc.diagnostics.find(
      (diagnostic) => diagnostic.code === "W_NON_ISO_FRONTMATTER_DATE"
    );

    expect(doc.meta.date).toBe("2026/03/30");
    expect(nonIsoDate?.message).toContain("YYYY-MM-DD");
  });
  it("warns when frontmatter date is ISO format but not a real calendar date", () => {
    const source = `---
id: exp-invalid-calendar-date
title: Invalid Calendar Date
date: 2026-02-30
---

Body.`;

    const doc = parseChemd(source);
    const invalidDateValue = doc.diagnostics.find(
      (diagnostic) => diagnostic.code === "W_INVALID_FRONTMATTER_DATE_VALUE"
    );

    expect(doc.meta.date).toBe("2026-02-30");
    expect(invalidDateValue?.message).toContain("real calendar date");
  });
  it("keeps valid render_overrides entries and reports invalid ones", () => {
    const source = `---
id: exp-partial-overrides
title: Partial Overrides
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: 2.4
  structure.unknownField: 1
  reaction: fast
  export.margin: 16
---

Body.`;

    const doc = parseChemd(source);
    const invalidKey = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("render_overrides key")
    );
    const unsupportedField = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("Unsupported render_overrides field")
    );

    expect(doc.renderSelection).toEqual({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLineWidth": 2.4,
        "export.margin": 16
      }
    });
    expect(invalidKey).toBeDefined();
    expect(unsupportedField).toBeDefined();
  });
  it("reports invalid render_overrides value types and keeps entries for downstream validation", () => {
    const source = `---
id: exp-invalid-override-type
title: Invalid Override Type
date: 2026-03-30
render_profile: publication-acs
render_overrides:
  structure.bondLineWidth: thick
  export.imageFormat: jpg
---

Body.`;

    const doc = parseChemd(source);
    const invalidBondLineWidth = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("structure.bondLineWidth")
    );
    const invalidImageFormat = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("export.imageFormat")
    );

    expect(invalidBondLineWidth?.message).toContain("number > 0");
    expect(invalidImageFormat?.message).toContain('"svg" | "png"');
    expect(doc.renderSelection).toEqual({
      profileId: "publication-acs",
      overrides: {
        "structure.bondLineWidth": "thick",
        "export.imageFormat": "jpg"
      }
    });
  });
  it("uses entry line positions for render_overrides value diagnostics", () => {
    const source = `---
id: exp-override-position
title: Override Position
date: 2026-03-30
render_overrides:
  export.imageFormat: jpg
---

Body.`;

    const doc = parseChemd(source);
    const invalidValue = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("export.imageFormat")
    );

    expect(invalidValue?.position?.start.line).toBe(6);
    expect(invalidValue?.position?.start.column).toBe(3);
  });

  it("reports nested frontmatter structures and skips nested lines", () => {
    const source = `---
id: exp-nested-frontmatter
title: Nested Frontmatter
date: 2026-03-30
render_overrides:
  structure:
    bondLineWidth: 2.1
project: oxidation-study
---

Body.`;

    const doc = parseChemd(source);
    const nestedObject = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("Nested frontmatter object")
    );
    const nestedStructure = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("Nested frontmatter structure")
    );

    expect(nestedObject).toBeDefined();
    expect(nestedStructure).toBeDefined();
    expect(doc.meta.project).toBe("oxidation-study");
  });
  it("reports unsupported frontmatter block scalars and continues parsing", () => {
    const source = `---
id: exp-block-scalar
title: Block Scalar Test
date: 2026-03-30
description: |
  line one
  line two
project: oxidation-study
---

Body.`;

    const doc = parseChemd(source);
    const unsupportedMultiline = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("block scalars")
    );
    const invalidLine = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_INVALID_FRONTMATTER_LINE");

    expect(unsupportedMultiline).toBeDefined();
    expect(invalidLine).toBeUndefined();
    expect(doc.meta.project).toBe("oxidation-study");
  });

  it("rejects implicit multiline frontmatter scalars and continues parsing", () => {
    const source = `---
id: exp-implicit-multiline
title: Implicit Multiline
date: 2026-03-31
description: first line
  second line
project: oxidation-study
---

Body.`;

    const doc = parseChemd(source);
    const unsupportedMultiline = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("implicit multiline scalars")
    );

    expect(unsupportedMultiline?.position?.start.line).toBe(5);
    expect(doc.meta.description).toBeUndefined();
    expect(doc.meta.project).toBe("oxidation-study");
  });

  it("attaches line and column positions for frontmatter diagnostics", () => {
    const source = `---
id: exp-position
title: First Title
date: 2026-03-30
title: Final Title
---

Body.`;

    const doc = parseChemd(source);
    const duplicateKey = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_DUPLICATE_FRONTMATTER_KEY");

    expect(duplicateKey?.position?.start.line).toBe(5);
    expect(duplicateKey?.position?.start.column).toBe(1);
    expect(duplicateKey?.position?.end.column).toBeGreaterThan(1);
  });

  it("parses yaml multiline arrays for tags", () => {
    const source = `---
id: exp-yaml-tags
title: YAML Tags
date: 2026-03-31
tags:
  - oxidation
  - "copper catalyst"
---

Body.`;

    const doc = parseChemd(source);

    expect(doc.meta.tags).toEqual(["oxidation", "copper catalyst"]);
    expect(doc.diagnostics.some((diagnostic) => diagnostic.code === "E_INVALID_FRONTMATTER_VALUE")).toBe(false);
  });

  it("keeps parsing valid keys after an invalid yaml line", () => {
    const source = `---
id: exp-yaml-invalid-line
title: YAML Invalid Line
date: 2026-03-31
project: oxidation-study
: invalid
status: completed
---

Body.`;

    const doc = parseChemd(source);
    const invalidLine = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_INVALID_FRONTMATTER_LINE");

    expect(doc.meta.project).toBe("oxidation-study");
    expect(doc.meta.status).toBe("completed");
    expect(invalidLine).toBeDefined();
  });

  it("keeps non-tags flow arrays intact after invalid line sanitization", () => {
    const source = `---
id: exp-yaml-flow-array-after-invalid
title: Draft Note
not a valid line
project: [Draft]
---

Body.`;

    const doc = parseChemd(source);
    const invalidLine = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_INVALID_FRONTMATTER_LINE");

    expect(invalidLine).toBeDefined();
    expect(doc.meta.project).toBe("[Draft]");
  });

  it("reports nested list structures under render_overrides", () => {
    const source = `---
id: exp-yaml-nested-list
title: YAML Nested List
date: 2026-03-31
render_overrides:
  structure.bondLineWidth:
    - 2.1
---

Body.`;

    const doc = parseChemd(source);
    const nestedObject = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("Nested frontmatter object")
    );
    const nestedStructure = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message.includes("Nested frontmatter structure")
    );

    expect(nestedObject).toBeDefined();
    expect(nestedStructure).toBeDefined();
    expect(doc.renderSelection).toBeUndefined();
  });
  it("reports nested object structures for unsupported frontmatter keys", () => {
    const source = `---
id: exp-non-scalar-object
title: Non Scalar Object
date: 2026-03-31
project:
  code: oxidation-study
---

Body.`;

    const doc = parseChemd(source);
    const nestedObject = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message === "Nested frontmatter object is not supported for project"
    );
    const nestedStructure = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message === "Nested frontmatter structure is not supported under project"
    );

    expect(doc.meta.project).toBeUndefined();
    expect(nestedObject?.position?.start.line).toBe(5);
    expect(nestedStructure?.position?.start.line).toBe(6);
  });

  it("reports nested list structures for unsupported frontmatter keys", () => {
    const source = `---
id: exp-non-scalar-list
title: Non Scalar List
date: 2026-03-31
status:
  - completed
---

Body.`;

    const doc = parseChemd(source);
    const nestedList = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message === "Nested frontmatter list is not supported for status"
    );
    const nestedStructure = doc.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === "E_INVALID_FRONTMATTER_VALUE" &&
        diagnostic.message === "Nested frontmatter structure is not supported under status"
    );

    expect(doc.meta.status).toBeUndefined();
    expect(nestedList?.position?.start.line).toBe(5);
    expect(nestedStructure?.position?.start.line).toBe(6);
  });

  it("warns on unknown structured fields without leaking them into the parsed node", () => {
    const source = `---
id: exp-unknown-field-pruning
title: Unknown Field Pruning
date: 2026-04-02
---

:::reaction #rxn-main
reactants: CCO
products: CC=O
bond_length: 1.5
:::`;

    const doc = parseChemd(source);
    const reaction = doc.children.find((child): child is ReactionNode => child.type === "reaction");
    const unknownField = doc.diagnostics.find((diagnostic) => diagnostic.code === "W_UNKNOWN_FIELD");

    expect(unknownField?.message).toContain("bond_length");
    expect(reaction).toBeDefined();
    expect(reaction).not.toHaveProperty("bond_length");
  });

  it("tokenizes molecule and analysis aliases as alias_field references", () => {
    const source = `---
id: exp-new-aliases
title: New Aliases
date: 2026-04-02
primary_molecule: mol-main
primary_analysis: ana-main
---

:::template quick-summary
bind: molecule=primary_molecule | analysis=primary_analysis

SMILES: @molecule.smiles
Data: @analysis.data
:::`;

    const doc = parseChemd(source);
    const template = doc.children.find((child): child is TemplateNode => child.type === "template");
    const markdown = template?.body.find((child): child is MarkdownNode => child.type === "markdown");

    expect(markdown?.references[0]).toMatchObject({
      kind: "alias_field",
      source: "molecule",
      field: "smiles"
    });
    expect(markdown?.references[1]).toMatchObject({
      kind: "alias_field",
      source: "analysis",
      field: "data"
    });
  });
});


