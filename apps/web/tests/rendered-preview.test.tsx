import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useRenderedPreview } from "../src/features/chem-preview/hooks/useRenderedPreview";

const RenderedPreviewProbe = () => {
  const { hydratedHtml, previewBridgeToken } = useRenderedPreview(
    '<section class="chemd-block chemd-block--molecule"><dl class="chemd-field"><dt>SMILES</dt><dd>CCO</dd></dl></section>'
  );

  return <div data-html={hydratedHtml} data-token={previewBridgeToken} />;
};

describe("useRenderedPreview", () => {
  it("does not inject the preview bridge into the server render", () => {
    const html = renderToString(<RenderedPreviewProbe />);

    expect(html).not.toContain("<script>");
    expect(html).toContain("data-token=\"\"");
  });
});
