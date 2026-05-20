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
          code: "W_CHEMD_KIND_AMBIGUOUS",
          severity: "error",
          message: "Chemd block kind cannot be inferred; declare kind explicitly.",
          sourceLayer: "parser",
          sourceNodeId: "rxn-main",
          quickFixes: [{
            title: "Insert kind: reaction in this chemd block",
              kind: "insert_chemd_kind",
              patch: { source_node_id: "rxn-main", kind: "reaction" }
            }]
        }]
      })
    );

    expect(html).toContain("W_CHEMD_KIND_AMBIGUOUS");
    expect(html).toContain("Insert kind: reaction in this chemd block");
  });
});
