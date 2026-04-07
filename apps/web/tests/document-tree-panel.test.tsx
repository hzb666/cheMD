import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocumentTreePanel } from "../src/features/document-tree/components/DocumentTreePanel";

describe("DocumentTreePanel", () => {
  it("renders document and block ids from source", () => {
    const html = renderToStaticMarkup(
      <DocumentTreePanel
        source={`---
id: exp-doc-001
---
:::chemd #chem-1
:::
:::result #res-1
:::
:::chemd #chem-2
smiles: CCO
:::
`}
      />
    );

    expect(html).toContain("Document outline (MVP)");
    expect(html).toContain("#exp-doc-001");
    expect(html).toContain("#chem-1");
    expect(html).toContain("#res-1");
    expect(html).toContain("#chem-2");
  });
});

