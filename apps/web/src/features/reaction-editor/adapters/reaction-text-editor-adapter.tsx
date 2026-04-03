import React from "react";

import { ReactionFrame } from "../components/ReactionFrame";
import type {
  ReactionDialogFrameRenderProps,
  ReactionEditorRuntimeState,
  ReactionEditorAdapter
} from "../components/ReactionDialog";
import {
  createReactionBridgeValue,
  normalizeReactionDraft
} from "../hooks/useReactionBridge";
import type { ReactionFrameValue } from "../types";

export const renderReactionTextEditorFrame = ({
  state,
  onChange
}: ReactionDialogFrameRenderProps<ReactionFrameValue>) => (
  <ReactionFrame
    value={state.payload}
    onChange={(next) =>
      onChange({
        draft: normalizeReactionDraft(next),
        payload: next
      })
    }
  />
);

export const reactionTextEditorAdapter: ReactionEditorAdapter<ReactionFrameValue> = {
  id: "text",
  createState: (draft) => ({
    draft,
    payload: createReactionBridgeValue(draft)
  }),
  exportDraft: async (state: ReactionEditorRuntimeState<ReactionFrameValue>) =>
    normalizeReactionDraft(state.payload),
  renderFrame: renderReactionTextEditorFrame
};
