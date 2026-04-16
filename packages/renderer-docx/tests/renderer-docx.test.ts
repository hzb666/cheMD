import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "@chemd/core";
import { resolveRenderProfile } from "@chemd/render-profile";

import { renderDocxBridge, renderDocxMarkdown } from "../src/index";

describe("DOCX bridge renderer", () => {
  it("renders Markdown and bridge payloads", () => {
    const document = createDocument(
      { id: "exp-docx", title: "DOCX test", date: "2026-04-17" },
      { children: [createMarkdownNode("body text")] }
    );

    expect(renderDocxMarkdown(document)).toContain("# DOCX test");
    expect(JSON.parse(renderDocxBridge(document, resolveRenderProfile()))).toMatchObject({
      version: "v0.1"
    });
  });
});
