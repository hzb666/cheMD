import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ChemEditorDialog,
  resolveVisibleChemEditorDraft
} from "../src/features/chem-editor/components/ChemEditorDialog";

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

    expect(html).toContain("Chem Editor");
    expect(html).toContain('data-chem-editor-kind="molecule"');
    expect(html).toContain('data-ketcher-host="embedded"');
    expect(html).toContain("chem-editor-dialog-card");
    expect(html).toContain("chem-editor-dialog-body");
    expect(html).toContain("Loading Ketcher");
    expect(html).not.toContain("chem-editor-conditions-input");
  });

  it("reuses the same dialog shell for reaction input without extra metadata controls", () => {
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

    expect(html).toContain("Chem Editor");
    expect(html).toContain('data-chem-editor-kind="reaction"');
    expect(html).toContain("chem-editor-dialog-card");
    expect(html).not.toContain("Reaction metadata");
    expect(html).not.toContain("chem-editor-conditions-input");
  });

  it("prefers the incoming value over stale local draft when a new edit session opens", () => {
    expect(
      resolveVisibleChemEditorDraft({
        open: true,
        value: {
          blockId: "mol-main",
          kind: "molecule",
          smiles: "CCO"
        },
        draft: {
          kind: "molecule",
          smiles: ""
        }
      })
    ).toMatchObject({
      kind: "molecule",
      smiles: "CCO"
    });
  });
});
