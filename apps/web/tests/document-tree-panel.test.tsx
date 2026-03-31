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
:::reaction #rxn-1
:::
:::result #res-1
:::
:::molecule #mol-1
smiles: CCO
:::
`}
      />
    );

    expect(html).toContain("Document outline (MVP)");
    expect(html).toContain("#exp-doc-001");
    expect(html).toContain("#rxn-1");
    expect(html).toContain("#res-1");
    expect(html).toContain("#mol-1");
  });
});

