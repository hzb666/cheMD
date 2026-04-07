import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/features/chem-preview/hooks/useRenderedPreview", () => ({
  useRenderedPreview: () => ({
    hydratedHtml: "<p>preview</p>",
    previewBridgeToken: "preview-token"
  })
}));

vi.mock("../src/features/export-docx/hooks/useDocxExport", () => ({
  useDocxExport: () => ({
    exportingDocx: false,
    exportMessage: null,
    exportDocx: vi.fn()
  })
}));

import PreviewShell from "../src/features/preview/components/PreviewShell";

describe("PreviewShell", () => {
  it("disables export while preview is stale", () => {
    const html = renderToStaticMarkup(
      <PreviewShell
        html="<p>preview</p>"
        json='{"ok":true}'
        docxBridge="{}"
        source="source"
        previewIsFresh={false}
      />
    );

    expect(html).toContain("Preview updating; export and structure edit are disabled.");
    expect(html).toContain("<button");
    expect(html).toContain("disabled");
  });
});
