import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChemEditorDialog } from "../src/features/chem-editor/components/ChemEditorDialog";

describe("ChemEditorDialog", () => {
  it("renders one shared chemical editor shell for molecule input", () => {
    const html = renderToStaticMarkup(
      <ChemEditorDialog
        open
        value={{
          blockId: "mol-main",
          kind: "molecule",
          smiles: "CCO"
        }}
        onClose={vi.fn()}
        onSave={vi.fn(async () => undefined)}
      />
    );

    expect(html).toContain("Edit chemistry");
    expect(html).toContain('data-chem-editor-kind="molecule"');
    expect(html).toContain('data-ketcher-host="embedded"');
    expect(html).toContain("chem-editor-dialog-card");
    expect(html).toContain("chem-editor-dialog-body");
    expect(html).toContain("Loading Ketcher");
    expect(html).not.toContain("chem-editor-conditions-input");
  });

  it("renders reaction metadata fields for reaction input in the same shared dialog", () => {
    const html = renderToStaticMarkup(
      <ChemEditorDialog
        open
        value={{
          blockId: "rxn-main",
          kind: "reaction",
          reactants: ["CCO", "O=O"],
          products: ["CC(=O)O"],
          conditions: ["air", "80 C"]
        }}
        onClose={vi.fn()}
        onSave={vi.fn(async () => undefined)}
      />
    );

    expect(html).toContain("Edit chemistry");
    expect(html).toContain('data-chem-editor-kind="reaction"');
    expect(html).toContain("chem-editor-dialog-card");
    expect(html).toContain("Reaction metadata");
    expect(html).toContain("chem-editor-conditions-input");
    expect(html).toContain("air\n80 C");
  });
});
