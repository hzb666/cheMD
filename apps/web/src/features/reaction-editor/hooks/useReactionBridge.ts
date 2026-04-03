import { useCallback, useMemo } from "react";

import {
  formatReactionListForEditor,
  parseReactionListFromEditor
} from "../lib/reaction-list";
import type { ReactionEditorDraft, ReactionFrameValue } from "../types";

export interface ReactionBridge {
  exportDraft: (value: ReactionFrameValue) => Promise<ReactionEditorDraft>;
  importDraft: (value: ReactionEditorDraft) => ReactionFrameValue;
}

export const normalizeReactionDraft = (value: ReactionFrameValue): ReactionEditorDraft => ({
  reactants: parseReactionListFromEditor(value.reactantsText),
  products: parseReactionListFromEditor(value.productsText),
  conditions: parseReactionListFromEditor(value.conditionsText)
});

export const normalizeReactionFrameValue = (value: ReactionFrameValue): ReactionFrameValue => ({
  reactantsText: formatReactionListForEditor(parseReactionListFromEditor(value.reactantsText)),
  productsText: formatReactionListForEditor(parseReactionListFromEditor(value.productsText)),
  conditionsText: formatReactionListForEditor(parseReactionListFromEditor(value.conditionsText))
});

export const createReactionBridgeValue = (value: ReactionEditorDraft): ReactionFrameValue =>
  normalizeReactionFrameValue({
    reactantsText: formatReactionListForEditor(value.reactants),
    productsText: formatReactionListForEditor(value.products),
    conditionsText: formatReactionListForEditor(value.conditions)
  });

export const useReactionBridge = (): ReactionBridge => {
  const exportDraft = useCallback(async (value: ReactionFrameValue) => {
    return normalizeReactionDraft(value);
  }, []);

  const importDraft = useCallback((value: ReactionEditorDraft) => {
    return createReactionBridgeValue(value);
  }, []);

  return useMemo(
    () => ({
      exportDraft,
      importDraft
    }),
    [exportDraft, importDraft]
  );
};
