import { describe, expect, it } from "vitest";

import { buildChemEditorSaveRequest } from "../src/features/chem-editor/lib/chem-editor-save";

describe("buildChemEditorSaveRequest", () => {
  it("builds a molecule save request for molecule drafts", () => {
    expect(
      buildChemEditorSaveRequest({
        blockId: "mol-main",
        kind: "molecule",
        smiles: "CCO",
        molfile: "mock-molfile"
      })
    ).toEqual({
      endpoint: "/api/chem/save",
      payload: {
        blockId: "mol-main",
        type: "molecule",
        smiles: "CCO",
        molfile: "mock-molfile"
      }
    });
  });

  it("builds a reaction save request for reaction drafts", () => {
    expect(
      buildChemEditorSaveRequest({
        blockId: "rxn-main",
        kind: "reaction",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"],
        reactionSmiles: "CCO.O=O>>CC(=O)O",
        rxnfile: "$RXN\nmock"
      })
    ).toEqual({
      endpoint: "/api/chem/save",
      payload: {
        blockId: "rxn-main",
        type: "reaction",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air", "80 C"],
        reactionSmiles: "CCO.O=O>>CC(=O)O",
        rxnfile: "$RXN\nmock"
      }
    });
  });
});
