import { describe, expect, it } from "vitest";

import { parseDocumentIdFromSource } from "../src/features/editor/lib/parse-document-id-from-source";

describe("parseDocumentIdFromSource", () => {
  it("reads id only from frontmatter", () => {
    const source = `---
id: doc-frontmatter
title: Example
date: 2026-04-02
---

Body

id: should-not-match
`;

    expect(parseDocumentIdFromSource(source)).toBe("doc-frontmatter");
  });

  it("falls back when frontmatter id is missing", () => {
    expect(parseDocumentIdFromSource("Body only")).toBe("workspace-doc");
  });
});
