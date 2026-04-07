import { describe, expect, it } from "vitest";

import {
  buildReactionSmiles,
  exportChemEditorDraft,
  getChemEditorImportCandidates,
  parseReactionSmiles
} from "../src/features/chem-editor/lib/chem-editor-export";

describe("chem editor export", () => {
  it("exports a molecule draft when the ketcher instance does not contain a reaction", async () => {
    const draft = await exportChemEditorDraft(
      {
        containsReaction: () => false,
        getSmiles: async () => "CCO",
        getMolfile: async () => "mock-molfile"
      },
      {
        kind: "molecule",
        smiles: "seed"
      }
    );

    expect(draft).toEqual({
      kind: "molecule",
      smiles: "CCO",
      molfile: "mock-molfile"
    });
  });

  it("exports a reaction draft when the ketcher instance contains a reaction and keeps reaction conditions", async () => {
    const draft = await exportChemEditorDraft(
      {
        containsReaction: () => true,
        getSmiles: async () => "CCO.O=O>>CC(=O)O",
        getRxn: async () => "$RXN\nmock-rxnfile",
        getMolfile: async () => {
          throw new Error("reaction should not request molfile");
        }
      },
      {
        kind: "reaction",
        reactants: ["seed-reactant"],
        products: ["seed-product"],
        conditions: ["air", "80 C"]
      }
    );

    expect(draft).toEqual({
      kind: "reaction",
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"],
      conditions: ["air", "80 C"],
      reactionSmiles: "CCO.O=O>>CC(=O)O",
      rxnfile: "$RXN\nmock-rxnfile"
    });
  });

  it("builds and parses reaction smiles from the reaction draft contract", () => {
    const smiles = buildReactionSmiles({
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"]
    });

    expect(smiles).toBe("CCO.O=O>>CC(=O)O");
    expect(parseReactionSmiles(smiles)).toEqual({
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"]
    });
  });

  it("prefers rxnfile when preparing reaction import candidates", () => {
    expect(
      getChemEditorImportCandidates({
        kind: "reaction",
        reactants: ["CCO", "O=O"],
        products: ["CC(=O)O"],
        conditions: ["air"],
        reactionSmiles: "CCO.O=O>>CC(=O)O",
        rxnfile: "$RXN\nreaction-file"
      })
    ).toEqual([
      "$RXN\nreaction-file",
      "CCO.O=O>>CC(=O)O",
      "CCO.O=O>>CC(=O)O"
    ]);
  });
});
