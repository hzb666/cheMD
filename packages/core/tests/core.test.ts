import { describe, expect, it } from "vitest";

import { createDocument, createMarkdownNode } from "../src/index";

describe("core AST helpers", () => {
  it("creates a document with stable metadata and children", () => {
    const document = createDocument(
      { id: "exp-core", title: "Core test", date: "2026-04-17" },
      { children: [createMarkdownNode("hello")] }
    );

    expect(document.meta.id).toBe("exp-core");
    expect(document.children[0]).toMatchObject({
      type: "markdown",
      value: "hello"
    });
  });
});
