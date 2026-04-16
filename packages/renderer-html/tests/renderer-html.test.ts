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
});
