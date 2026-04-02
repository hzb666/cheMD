import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Page from "../src/app/page";

describe("Page", () => {
  it("renders the shadcn-style editor and preview workbench", () => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain('data-playground-shell="workbench"');
    expect(html).toContain('data-playground-panel="editor"');
    expect(html).toContain('data-playground-panel="preview"');
    expect(html).toContain("Editor");
    expect(html).toContain("Preview");
    expect(html).not.toContain("Tree");
    expect(html).not.toContain("Document outline (MVP)");
    expect(html).toContain("JSON");
    expect(html).toContain("DOCX");
    expect(html).toContain("Export");
    expect(html).toContain("OCR Image");
    expect(html).toContain("YAML publication-acs");
    expect(html).toContain("panel-heading-inline");
    expect(html).toContain("tab-strip-container");
    expect(html).toContain("tab-indicator");
    expect(html).toContain("chemd-source-editor");
    expect(html).toContain("chem-inline");
    expect(html).toContain("chemd-block--reaction");
  });
});
