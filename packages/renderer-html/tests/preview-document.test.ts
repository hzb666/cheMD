import { describe, expect, it } from "vitest";

import {
  PREVIEW_DOCUMENT_STYLE,
  PREVIEW_THEME_SYNC_MESSAGE_TYPE,
  toSandboxedPreviewDocument
} from "../src";

describe("preview document shell", () => {
  it("exports the playground preview style and theme sync shell", () => {
    const document = toSandboxedPreviewDocument("<article>Preview</article>", "dark");

    expect(PREVIEW_DOCUMENT_STYLE).toContain(".chemd-tlc-plate");
    expect(PREVIEW_DOCUMENT_STYLE).toContain(".chemd-graphic");
    expect(document).toContain('data-theme="dark"');
    expect(document).toContain(PREVIEW_THEME_SYNC_MESSAGE_TYPE);
    expect(document).toContain("<article>Preview</article>");
  });

  it("uses a nonce for the built-in theme sync script", () => {
    const document = toSandboxedPreviewDocument("<script>alert('user html')</script>");

    expect(document).toContain("script-src 'nonce-");
    expect(document).not.toContain("script-src 'unsafe-inline'");
    expect(document).toMatch(/<script nonce="[a-z0-9]+">\(\(\) => \{/);
    expect(document).toContain("<script>alert('user html')</script>");
  });
});
