import { describe, expect, it } from "vitest";

import {
  createDocument,
  createInlineChemToken,
  createInlineCodeToken,
  createMarkdownLinkToken,
  createMarkdownNode,
  classifyReactionConditions,
  classifyTlcAnalysis,
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
    const normalized = classifyReactionConditions({
        conditions: ["Cu catalyst", "EtOH", "80 C", "4 h", "N2", "Na2CO3"],
        solvent: "EtOH"
      });

    expect(normalized).toMatchObject({
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
    expect(normalized).not.toHaveProperty("conditions_text");
  });

  it("classifies tlc analysis lanes into normalized structures", () => {
    expect(
      classifyTlcAnalysis({
        type: "analysis",
        id: "ana-tlc",
        type_name: "tlc",
        time: "0.5 h",
        p1: "sm 0.60 ^5(4) | mess(0.10) 3(2)",
        p2: "pd2 0.20 4(3)",
        p3: "1 none",
        p4: "reaction 0.05 v2(1) | base"
      })
    ).toMatchObject({
      time: {
        raw: "0.5 h",
        value: 0.5,
        unit: "h"
      },
      plate: {
        raw: "silica gel GF254",
        normalized: "silica gel GF254"
      },
      visualization: {
        raw: "UV 254 nm",
        normalized: "UV 254 nm"
      },
      lanes: [
        {
          lane_id: "p1",
          lane_label_raw: "sm",
          lane_role: "starting_material",
          has_base: false,
          is_none: false,
          spots: [
            {
              rf_raw: "0.60",
              rf: 0.6,
              shape: "up",
              size_rank: 5,
              intensity_rank: 4
            }
          ],
          mess_regions: [
            {
              rf_raw: "0.10",
              rf: 0.1,
              size_rank: 3,
              intensity_rank: 2
            }
          ]
        },
        {
          lane_id: "p2",
          lane_label_raw: "pd2",
          lane_role: "product",
          lane_index: 2
        },
        {
          lane_id: "p3",
          lane_label_raw: "1",
          lane_role: "trial",
          lane_index: 1,
          is_none: true,
          spots: [],
          mess_regions: []
        },
        {
          lane_id: "p4",
          lane_label_raw: "reaction",
          lane_role: "reaction",
          has_base: true,
          spots: [
            {
              rf_raw: "0.05",
              rf: 0.05,
              shape: "down",
              size_rank: 2,
              intensity_rank: 1
            }
          ]
        }
      ]
    });
  });

  it("caps tlc spot and mess ranks at five for rendering", () => {
    expect(
      classifyTlcAnalysis({
        type: "analysis",
        id: "ana-tlc-rank-cap",
        type_name: "tlc",
        p1: "sm 0.75 ^8(9) | mess(0.20) 7(6)"
      })
    ).toMatchObject({
      lanes: [
        {
          lane_id: "p1",
          spots: [
            {
              size_rank: 5,
              intensity_rank: 5
            }
          ],
          mess_regions: [
            {
              size_rank: 5,
              intensity_rank: 5
            }
          ]
        }
      ]
    });
  });
});


