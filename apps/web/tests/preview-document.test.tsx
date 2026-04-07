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
  });
});
