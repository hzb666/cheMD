import type { ReactionEditorDraft } from "../types";

interface ReactionSaveResponse {
  reactants: string[];
  products: string[];
  conditions: string[];
  reactionSmiles?: string;
  rxnfile?: string;
}

export const buildReactionSaveRequest = (value: ReactionEditorDraft): ReactionSaveResponse => ({
  reactants: value.reactants,
  products: value.products,
  conditions: value.conditions,
  reactionSmiles: value.reactionSmiles,
  rxnfile: value.rxnfile
});

export const resolveSavedReactionDraft = (
  currentDraft: ReactionEditorDraft,
  savedPayload: ReactionSaveResponse
): ReactionEditorDraft => ({
  reactants: savedPayload.reactants,
  products: savedPayload.products,
  conditions: savedPayload.conditions.length > 0
    ? savedPayload.conditions
    : currentDraft.conditions.filter((item) => item.trim().length > 0),
  reactionSmiles:
    typeof savedPayload.reactionSmiles === "string" ? savedPayload.reactionSmiles : currentDraft.reactionSmiles,
  rxnfile:
    typeof savedPayload.rxnfile === "string" ? savedPayload.rxnfile : currentDraft.rxnfile
});
