import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import {
  mapRenderOptionsToAdapterPayload,
  resolveRenderProfile
} from "@chemd/render-profile";

import { createDocxBridgePayload, renderDocxBridge, renderDocxMarkdown } from "../src";

describe("renderer-docx", () => {
  it("creates a structured DOCX bridge payload with render metadata", () => {
    const document = createDocument(
      { id: "exp-docx", title: "DOCX Test", date: "2026-03-31" },
      {
        children: [createMarkdownNode("# Heading")],
        diagnostics: [{ code: "W_TEST", severity: "warning", message: "test warning" }]
      }
    );
    const options = resolveRenderProfile({ profileId: "slides-large" });
    const adapterPayload = mapRenderOptionsToAdapterPayload(options);

    const payload = createDocxBridgePayload(document, options, adapterPayload);

    expect(payload.version).toBe("v0.1");
    expect(payload.document.meta.title).toBe("DOCX Test");
    expect(payload.render.profileId).toBe("slides-large");
    expect(payload.render.adapter?.rdkit.fixedBondLength).toBe(options.structure.bondLength);
    expect(payload.exportHints.format).toBe("docx-bridge");
  });

  it("serializes DOCX bridge payload as JSON text", () => {
    const document = createDocument({ id: "exp-docx-json", title: "DOCX JSON", date: "2026-03-31" });
    const options = resolveRenderProfile();
    const output = renderDocxBridge(document, options);
    const parsed = JSON.parse(output) as { render: { profileId: string }; exportHints: { recommendedTool: string } };

    expect(parsed.render.profileId).toBe(options.profileId);
    expect(parsed.exportHints.recommendedTool).toBe("pandoc");
  });

  it("renders markdown export text for DOCX pipeline handoff", () => {
    const document = createDocument(
      { id: "exp-docx-md", title: "DOCX Markdown", date: "2026-03-31", project: "oxidation-study" },
      {
        children: [
          createMarkdownNode("## Objective\nPrepare oxidation run."),
          {
            type: "reaction",
            id: "rxn-main",
            reactants: ["CCO", "O=O"],
            products: ["CC(=O)O"],
            conditions: ["air", "80 C"],
            temperature: "200 °C",
            time: "4 h"
          }
        ]
      }
    );

    const markdown = renderDocxMarkdown(document);

    expect(markdown).toContain("---");
    expect(markdown).toContain("project: oxidation-study");
    expect(markdown).toContain("# DOCX Markdown");
    expect(markdown).toContain("### Reaction `rxn-main`");
    expect(markdown).toContain("- Reactants: CCO + O=O");
    expect(markdown).toContain("- Conditions: air | 80 C");
  });
});

