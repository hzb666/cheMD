export interface ReactionEditorDraft {
  reactants: string[];
  products: string[];
  conditions: string[];
}

export interface ReactionFrameValue {
  reactantsText: string;
  productsText: string;
  conditionsText: string;
}

export interface ReactionEditorDraftWithBlockId extends ReactionEditorDraft {
  blockId: string;
  sourceReactionKey?: string;
}
