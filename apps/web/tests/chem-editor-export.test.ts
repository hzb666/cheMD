import { describe, expect, it } from "vitest";

import {
  buildReactionSmiles,
  exportChemEditorDraft,
  getChemEditorImportCandidates,
  parseReactionSmiles
} from "../src/features/chem-editor/lib/chem-editor-export";
import type { ChemEditorDraft } from "../src/features/chem-editor/types";

const createReactionInstance = (reactionSmiles: string, rxnfile = "") =>
  ({
    containsReaction: () => true,
    getSmiles: async () => reactionSmiles,
    getRxn: async () => rxnfile,
    getMolfile: async () => {
      throw new Error("getMolfile should not be called for reactions");
    }
  });

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

  it("keeps ionic multi-fragment participants grouped when exporting a reaction draft", async () => {
    const currentDraft: ChemEditorDraft = {
      kind: "reaction",
      reactants: ["O=C([O-])[O-].[K+].[K+]", "CCO"],
      products: ["CCOC(=O)[O-].[K+].[K+]"],
      conditions: ["80 C"]
    };

    const exported = await exportChemEditorDraft(
      createReactionInstance(
        "O=C([O-])[O-].[K+].[K+].CCO>>CCOC(=O)[O-].[K+].[K+]",
        `$RXN

Codex

  2  1
$MOL`
      ),
      currentDraft
    );

    expect(exported).toMatchObject({
      kind: "reaction",
      reactants: ["O=C([O-])[O-].[K+].[K+]", "CCO"],
      products: ["CCOC(=O)[O-].[K+].[K+]"],
      conditions: ["80 C"]
    });
  });

  it("still splits simple reaction smiles into separate participants when grouping is unambiguous", async () => {
    const currentDraft: ChemEditorDraft = {
      kind: "reaction",
      reactants: ["CCO"],
      products: ["CC(=O)O"],
      conditions: []
    };

    const exported = await exportChemEditorDraft(
      createReactionInstance(
        "CCO.O=O>>CC(=O)O",
        `$RXN

Codex

  2  1
$MOL`
      ),
      currentDraft
    );

    expect(exported).toMatchObject({
      kind: "reaction",
      reactants: ["CCO", "O=O"],
      products: ["CC(=O)O"]
    });
  });
});
