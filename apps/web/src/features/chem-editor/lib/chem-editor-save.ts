import type { ChemEditorDraftWithBlockId } from "../types";

type ChemEditorSaveRequest =
  | {
      endpoint: "/api/chem/structure/save";
      payload: {
        blockId: string;
        smiles: string;
        molfile?: string;
      };
    }
  | {
      endpoint: "/api/chem/reaction/save";
      payload: {
        blockId: string;
        reactants: string[];
        products: string[];
        conditions: string[];
      };
    };

export const buildChemEditorSaveRequest = (
  draft: ChemEditorDraftWithBlockId
): ChemEditorSaveRequest => {
  if (draft.kind === "reaction") {
    return {
      endpoint: "/api/chem/reaction/save",
      payload: {
        blockId: draft.blockId,
        reactants: draft.reactants,
        products: draft.products,
        conditions: draft.conditions
      }
    };
  }

  return {
    endpoint: "/api/chem/structure/save",
    payload: {
      blockId: draft.blockId,
      smiles: draft.smiles,
      molfile: draft.molfile
    }
  };
};
