import type { ChemEditorDraftWithBlockId } from "../types";

type ChemEditorSaveRequest =
  | {
      endpoint: "/api/chem/save";
      payload: {
        blockId: string;
        type: "molecule";
        smiles: string;
        molfile?: string;
      };
    }
  | {
      endpoint: "/api/chem/save";
      payload: {
        blockId: string;
        type: "reaction";
        reactants: string[];
        products: string[];
        conditions: string[];
        reactionSmiles?: string;
        rxnfile?: string;
      };
    };

export const buildChemEditorSaveRequest = (
  draft: ChemEditorDraftWithBlockId
): ChemEditorSaveRequest => {
  if (draft.kind === "reaction") {
    return {
      endpoint: "/api/chem/save",
      payload: {
        blockId: draft.blockId,
        type: "reaction",
        reactants: draft.reactants,
        products: draft.products,
        conditions: draft.conditions,
        reactionSmiles: draft.reactionSmiles,
        rxnfile: draft.rxnfile
      }
    };
  }

  return {
    endpoint: "/api/chem/save",
    payload: {
      blockId: draft.blockId,
      type: "molecule",
      smiles: draft.smiles,
      molfile: draft.molfile
    }
  };
};
