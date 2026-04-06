export interface ChemEditorMoleculeDraft {
  kind: "molecule";
  smiles: string;
  molfile?: string;
}

export interface ChemEditorReactionDraft {
  kind: "reaction";
  reactants: string[];
  products: string[];
  conditions: string[];
  reactionSmiles?: string;
  rxnfile?: string;
}

export type ChemEditorDraft = ChemEditorMoleculeDraft | ChemEditorReactionDraft;

export type ChemEditorDraftWithBlockId = ChemEditorDraft & {
  blockId: string;
  sourceKind?: "molecule" | "reaction";
};

export interface KetcherBridgeInstance {
  changeEvent?: {
    add?: (handler: () => void, priority?: number) => void;
    remove?: (handler: () => void) => void;
  };
  containsReaction: () => boolean;
  getSmiles: () => Promise<string>;
  getMolfile: () => Promise<string>;
  getRxn?: () => Promise<string>;
  setMolecule: (structure: string) => Promise<void | undefined>;
}
