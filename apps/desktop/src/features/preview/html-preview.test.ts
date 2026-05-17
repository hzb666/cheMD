import { describe, expect, it } from "vitest";

import { buildDesktopPreviewDocument } from "./html-preview";

describe("buildDesktopPreviewDocument", () => {
  it("passes the resolved dark theme to the sandboxed preview document", () => {
    const document = buildDesktopPreviewDocument("<article>Preview</article>", "dark");

    expect(document).toContain('class="dark" data-theme="dark"');
    expect(document).toContain("chemd:theme-sync");
    expect(document).toContain("root.classList.toggle(\"dark\", theme === \"dark\")");
  });

  it("keeps the desktop workspace background override for light preview documents", () => {
    const document = buildDesktopPreviewDocument("<article>Preview</article>", "light", "#f8fafc");

    expect(document).toContain('data-theme="light"');
    expect(document).toContain("--preview-background: #f8fafc;");
  });
});
