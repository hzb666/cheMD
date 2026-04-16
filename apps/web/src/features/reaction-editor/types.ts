export interface ReactionEditorDraft {
  reactants: string[];
  products: string[];
  conditions: string[];
  reactionSmiles?: string;
  rxnfile?: string;
}

export interface ReactionEditorDraftWithBlockId extends ReactionEditorDraft {
  blockId: string;
  sourceReactionKey?: string;
  draftReactionKey?: string;
}
