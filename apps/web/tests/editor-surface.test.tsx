import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EditorSurface } from "../src/features/editor/components/EditorSurface";

describe("EditorSurface", () => {
  it("derives line numbers from logical lines in the source text", () => {
    const html = renderToStaticMarkup(
      <EditorSurface
        source={"long wrapped candidate line\nsecond line\n"}
        onSourceChange={vi.fn()}
      />
    );

    expect(html).toContain('id="chemd-source-editor"');
    expect(html).toContain('data-editor-line-number="1"');
    expect(html).toContain('data-editor-line-number="2"');
    expect(html).toContain('data-editor-line-number="3"');
    expect(html).toContain("grid-cols-[0rem_minmax(0,1fr)]");
  });
});
