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
    expect(document).toContain("script-src 'nonce-");
    expect(document).not.toContain("script-src 'unsafe-inline'");
    expect(document).toMatch(/<script nonce="[a-z0-9]+">\(\(\) => \{/);
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
    expect(document).toContain("chemd:theme-sync");
    expect(document).toContain("root.style.colorScheme = theme;");
    expect(document).toContain('data-theme="light"');
  });

  it("includes dedicated tlc preview styles", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>");

    expect(document).toContain(".chemd-tlc {");
    expect(document).toContain(".chemd-tlc-plate {");
    expect(document).toContain(".chemd-tlc-solvent-front {");
    expect(document).toContain(".chemd-tlc-baseline {");
    expect(document).toContain(".chemd-tlc-lane-label {");
    expect(document).toContain(".chemd-tlc-spot[data-shape=\"up\"] {");
    expect(document).toContain(".chemd-tlc-spot[data-shape=\"down\"] {");
    expect(document).toContain(".chemd-tlc-spot[data-intensity-rank=\"5\"] {");
    expect(document).toContain(".chemd-tlc-mess {");
    expect(document).toContain(".chemd-tlc-base-spot {");
    expect(document).not.toContain("--preview-tlc-plate-background");
    expect(document).not.toContain("--preview-tlc-plate-shadow");
  });

  it("marks dark-theme documents and keeps chemistry graphics readable", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>", "dark");

    expect(document).toContain('class="dark" data-theme="dark"');
    expect(document).toContain(".dark .chemd-graphic:not([data-chem-render-state=\"loading\"])");
    expect(document).toContain("--preview-background: #191919;");
    expect(document).toContain("--preview-background-soft: #31302e;");
    expect(document).toContain("rgba(18, 18, 18, 0.985)");
    expect(document).toContain("rgba(28, 28, 27, 0.94)");
    expect(document).toContain(".dark .chemd-graphic svg:not(.chemd-loading-svg) {");
    expect(document).toContain("filter: invert(0.93) hue-rotate(180deg);");
    expect(document).toContain(".dark .chemd-inventory-popover[data-state=\"ready\"] {");
    expect(document).toContain("border-color: rgba(255, 255, 255, 0.14);");
    expect(document).not.toContain("rgba(15, 23, 42, 0.92)");
    expect(document).not.toContain("filter: brightness(0)");
    expect(document).toContain("--preview-tlc-line: rgba(255, 255, 255, 0.72);");
    expect(document).toContain("--preview-tlc-base: #f8fafc;");
  });

  it("avoids theme-transition lag inside preview surfaces", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>", "dark");

    expect(document).not.toContain("background-color 180ms ease");
    expect(document).not.toContain("border-color 180ms ease");
    expect(document).not.toContain("box-shadow 180ms ease");
    expect(document).not.toContain("background-color 160ms ease");
    expect(document).not.toContain("border-color 160ms ease");
    expect(document).not.toContain("color 160ms ease");
    expect(document).not.toContain("box-shadow 160ms ease");
    expect(document).toContain("opacity 160ms ease");
    expect(document).toContain("transform 160ms ease");
    expect(document).toContain("opacity 180ms ease");
    expect(document).toContain("transform 180ms ease");
  });

  it("embeds an iframe theme sync bridge script", () => {
    const document = toSandboxedPreviewDocument("<section>Preview</section>", "dark");

    expect(document).toContain('window.addEventListener("message"');
    expect(document).toContain('payload.type !== "chemd:theme-sync"');
    expect(document).toContain("body.style.colorScheme = theme;");
    expect(document).toContain("root.classList.toggle(\"dark\", theme === \"dark\")");
  });
});
