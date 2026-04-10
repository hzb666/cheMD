import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import PreviewShell from "../src/features/preview/components/PreviewShell";
import { toSandboxedPreviewDocument } from "../src/features/preview/styles/preview-document";

describe("preview document hardening", () => {
  it("renders preview iframe without popup privileges", () => {
    const html = renderToStaticMarkup(
      <PreviewShell html="<div>Preview</div>" json="{}" docxBridge="{}" source="---" />
    );

    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-popups");
  });

  it("wraps preview html with a CSP sandbox document", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>");

    expect(document).toContain("Content-Security-Policy");
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("script-src 'unsafe-inline'");
    expect(document).toContain('Arial, "Source Han Sans SC"');
    expect(document).toContain("::-webkit-scrollbar-button {");
    expect(document).toContain(".chemd-block--reaction:hover > .chemd-edit-chem");
    expect(document).toContain(".chemd-block h2 {");
    expect(document).toContain("position: relative;");
    expect(document).toContain("z-index: 0;");
    expect(document).toContain(".chemd-edit-chem {");
    expect(document).toContain("position: absolute;");
    expect(document).toContain("z-index: 5;");
    expect(document).toContain("opacity: 0;");
    expect(document).toContain("pointer-events: none;");
    expect(document).toContain("transform: translateX(-0.35rem);");
    expect(document).toContain("pointer-events: auto;");
    expect(document).toContain("transform: translateX(0);");
    expect(document).toContain(".chemd-inventory-popover {");
    expect(document).toContain('data-visible="true"');
    expect(document).toContain("transform-origin: top right;");
    expect(document).toContain("right: 2.65rem;");
    expect(document).toContain("max-height: 22rem;");
    expect(document).toContain("max-width: 100%");
    expect(document).not.toContain(".chemd-block--reaction .chemd-graphic svg:not(.chemd-loading-svg)");
    expect(document).toContain('data-theme="light"');
  });

  it("marks dark-theme documents and keeps chemistry graphics readable", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>", "dark");

    expect(document).toContain('class="dark" data-theme="dark"');
    expect(document).toContain(".dark .chemd-graphic:not([data-chem-render-state=\"loading\"])");
    expect(document).toContain("--preview-chem-surface");
  });
});
