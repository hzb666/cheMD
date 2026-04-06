import { describe, expect, it } from "vitest";

import {
  createDocument,
  createInlineChemToken,
  createInlineCodeToken,
  createMarkdownLinkToken,
  createMarkdownNode,
  classifyReactionConditions,
  createReferenceToken,
  getRenderOverrideValueHint,
  isKnownRenderOverridePath,
  isRenderOverridePathFormat,
  isValidRenderOverrideValue
} from "../src";

describe("core ast helpers", () => {
  it("creates a chemd document with empty diagnostics and children", () => {
    const doc = createDocument({ id: "exp-1", title: "Test", date: "2026-03-30" });

    expect(doc.type).toBe("document");
    expect(doc.children).toEqual([]);
    expect(doc.diagnostics).toEqual([]);
    expect(doc.meta.id).toBe("exp-1");
  });

  it("creates markdown nodes with typed inline/reference/link tokens", () => {
    const reference = createReferenceToken({
      kind: "object_field",
      source: "res-main",
      field: "yield",
      raw: "@res-main.yield",
      start: 7,
      end: 22,
      startLine: 1,
      startColumn: 8,
      endLine: 1,
      endColumn: 23
    });
    const chem = createInlineChemToken({
      raw: ":chem[H2O]",
      value: "H2O",
      start: 28,
      end: 38,
      startLine: 1,
      startColumn: 29,
      endLine: 1,
      endColumn: 39
    });
    const code = createInlineCodeToken({
      raw: "`@res-main.yield`",
      value: "@res-main.yield",
      start: 43,
      end: 59,
      startLine: 1,
      startColumn: 44,
      endLine: 1,
      endColumn: 60
    });
    const link = createMarkdownLinkToken({
      raw: "[Spec](https://example.com)",
      label: "Spec",
      href: "https://example.com",
      safe: true,
      start: 61,
      end: 89,
      startLine: 1,
      startColumn: 62,
      endLine: 1,
      endColumn: 90
    });
    const node = createMarkdownNode(
      "Yield: @res-main.yield with :chem[H2O] and `@res-main.yield`",
      [reference],
      [chem],
      [code],
      [link]
    );

    expect(node.type).toBe("markdown");
    expect(node.references).toHaveLength(1);
    expect(node.references[0]).toMatchObject({
      field: "yield",
      start: 7,
      end: 22,
      startLine: 1,
      startColumn: 8,
      endLine: 1,
      endColumn: 23
    });
    expect(node.inlineChem).toHaveLength(1);
    expect(node.inlineChem[0]).toMatchObject({
      value: "H2O",
      start: 28,
      end: 38,
      startLine: 1,
      startColumn: 29,
      endLine: 1,
      endColumn: 39
    });
    expect(node.inlineCode).toHaveLength(1);
    expect(node.inlineCode[0]).toMatchObject({
      value: "@res-main.yield",
      start: 43,
      end: 59,
      startLine: 1,
      startColumn: 44,
      endLine: 1,
      endColumn: 60
    });
    expect(node.links).toHaveLength(1);
    expect(node.links[0]).toMatchObject({
      href: "https://example.com",
      start: 61,
      end: 89,
      startLine: 1,
      startColumn: 62,
      endLine: 1,
      endColumn: 90
    });
  });

  it("validates render override paths against shared allowlist", () => {
    expect(isKnownRenderOverridePath("structure.bondLineWidth")).toBe(true);
    expect(isKnownRenderOverridePath("reaction.arrowLength")).toBe(true);
    expect(isKnownRenderOverridePath("export.margin")).toBe(true);

    expect(isKnownRenderOverridePath("structure.unknownField")).toBe(false);
    expect(isKnownRenderOverridePath("reaction")).toBe(false);
    expect(isKnownRenderOverridePath("custom.field")).toBe(false);
  });

  it("validates render override key format independently from allowlist", () => {
    expect(isRenderOverridePathFormat("structure.bondLineWidth")).toBe(true);
    expect(isRenderOverridePathFormat("structure.unknownField")).toBe(true);
    expect(isRenderOverridePathFormat("reaction")).toBe(false);
    expect(isRenderOverridePathFormat("custom.field")).toBe(false);
  });

  it("shares render override value validators and hints", () => {
    expect(isValidRenderOverrideValue("structure.bondLineWidth", 2.4)).toBe(true);
    expect(isValidRenderOverrideValue("structure.bondLineWidth", "thick")).toBe(false);
    expect(isValidRenderOverrideValue("export.imageFormat", "png")).toBe(true);
    expect(isValidRenderOverrideValue("export.imageFormat", "jpg")).toBe(false);
    expect(getRenderOverrideValueHint("export.imageFormat")).toBe('"svg" | "png"');
    expect(getRenderOverrideValueHint("structure.unknownField")).toBeUndefined();
  });

  it("classifies reaction condition text into structured fields", () => {
    expect(
      classifyReactionConditions({
        conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"],
        solvent: "EtOH"
      })
    ).toMatchObject({
      solvent: {
        raw: "EtOH",
        normalized: "ethanol"
      },
      catalyst: {
        raw: "Cu catalyst",
        normalized: "Cu catalyst"
      },
      reagents: {
        raw: "Na2CO3",
        normalized: ["Na2CO3"]
      },
      atmosphere: {
        raw: "N2",
        normalized: "nitrogen"
      },
      temperature: {
        raw: "80 C",
        value: 80,
        unit: "C"
      },
      time: {
        raw: "4 h",
        value: 4,
        unit: "h"
      }
    });
  });
});


