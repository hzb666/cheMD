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
import { DiagnosticQuickFixPanel } from "../src/features/diagnostics/components/DiagnosticQuickFixPanel";

describe("PreviewShell", () => {
  it("keeps stale preview status out of the render surface", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreviewShell, {
        html: "<p>preview</p>",
        json: '{"ok":true}',
        docxBridge: "{}",
        source: "source",
        previewIsFresh: false
      })
    );

    expect(html).not.toContain("Preview updating; export and structure edit are disabled.");
    expect(html).toContain("Rendered document preview");
  });

  it("renders diagnostic quick fixes", () => {
    const html = renderToStaticMarkup(
      React.createElement(DiagnosticQuickFixPanel, {
        diagnostics: [{
          code: "W_AUTHORING_FIX_AVAILABLE",
          severity: "warning",
          message: "A conservative field patch is available.",
          sourceLayer: "compiler",
          sourceNodeId: "res-main",
          quickFixes: [{
              title: "Add reaction reference",
              kind: "apply_authoring_patch",
              patch: { kind: "insert_declaration_field", declarationId: "res-main", line: "reaction: @rxn-main" }
            }]
        }]
      })
    );

    expect(html).toContain("W_AUTHORING_FIX_AVAILABLE");
    expect(html).toContain("Add reaction reference");
  });
});
