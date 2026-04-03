import { describe, expect, it } from "vitest";

import { readPreviewEditMessage } from "../src/features/preview/lib/read-preview-edit-message";

describe("readPreviewEditMessage", () => {
  it("accepts messages only from the active preview iframe", () => {
    const previewWindow = {} as Window;
    const otherWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: otherWindow,
          data: { type: "chemd:edit-molecule", blockId: "mol-1", smiles: "CCO" }
        },
        previewWindow,
        true
      )
    ).toBeNull();

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: { type: "chemd:edit-molecule", blockId: "mol-1", smiles: "CCO" }
        },
        previewWindow,
        true
      )
    ).toEqual({
      kind: "molecule",
      blockId: "mol-1",
      smiles: "CCO"
    });
  });

  it("sanitizes malformed payloads", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "https://example.com",
          source: previewWindow,
          data: { type: "chemd:edit-molecule", blockId: "mol-1", smiles: "CCO" }
        },
        previewWindow,
        true
      )
    ).toBeNull();

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: { type: "chemd:edit-molecule", blockId: "mol-1", smiles: 123 }
        },
        previewWindow,
        true
      )
    ).toEqual({
      kind: "molecule",
      blockId: "mol-1",
      smiles: ""
    });
  });

  it("accepts reaction edit messages from the active preview iframe", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: {
            type: "chemd:edit-reaction",
            blockId: "rxn-1",
            reactants: ["CCO"],
            products: ["CC(=O)O"],
            conditions: ["air"]
          }
        },
        previewWindow,
        true
      )
    ).toEqual({
      kind: "reaction",
      blockId: "rxn-1",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: ["air"]
    });
  });

  it("rejects edit messages while preview is stale", () => {
    const previewWindow = {} as Window;

    expect(
      readPreviewEditMessage(
        {
          origin: "null",
          source: previewWindow,
          data: { type: "chemd:edit-molecule", blockId: "mol-1", smiles: "CCO" }
        },
        previewWindow,
        false
      )
    ).toBeNull();
  });
});
