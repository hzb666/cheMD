import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Page from "../src/app/page";

describe("Page", () => {
  it("renders the linear-style editor and preview workbench", () => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain("Editor");
    expect(html).toContain("Preview");
    expect(html).toContain("JSON");
    expect(html).toContain("DOCX");
    expect(html).toContain("Export");
    expect(html).toContain("YAML publication-acs");
    expect(html).toContain("chemd-source-editor");
    expect(html).toContain("chem-inline");
    expect(html).toContain("chemd-block--reaction");
  });
});
