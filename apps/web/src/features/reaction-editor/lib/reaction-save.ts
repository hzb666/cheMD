import type { ReactionEditorDraft } from "../types";

interface ReactionSaveResponse {
  reactants: string[];
  products: string[];
  conditions: string[];
}

export const buildReactionSaveRequest = (value: ReactionEditorDraft): ReactionSaveResponse => ({
  reactants: value.reactants,
  products: value.products,
  conditions: value.conditions
});

export const resolveSavedReactionDraft = (
  currentDraft: ReactionEditorDraft,
  savedPayload: ReactionSaveResponse
): ReactionEditorDraft => ({
  reactants: savedPayload.reactants,
  products: savedPayload.products,
  conditions: savedPayload.conditions.length > 0
    ? savedPayload.conditions
    : currentDraft.conditions.filter((item) => item.trim().length > 0)
});
