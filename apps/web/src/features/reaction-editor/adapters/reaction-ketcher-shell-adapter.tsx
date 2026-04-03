import React from "react";

import { ReactionKetcherFrame } from "../components/ReactionKetcherFrame";
import type {
  ReactionDialogFrameRenderProps,
  ReactionEditorAdapter,
} from "../components/ReactionDialog";
import {
  createReactionKetcherShellValue,
  exportReactionDraftFromKetcherShell,
  normalizeReactionKetcherShellValue,
  type ReactionKetcherShellValue
} from "../lib/reaction-ketcher-shell";
import { normalizeReactionDraft } from "../hooks/useReactionBridge";

export const renderReactionKetcherShellFrame = ({
  state,
  onChange
}: ReactionDialogFrameRenderProps<ReactionKetcherShellValue>) => (
  <ReactionKetcherFrame
    value={state.payload}
    onChange={(next) =>
      onChange({
        draft: normalizeReactionDraft(next.editorValue),
        payload: normalizeReactionKetcherShellValue(next)
      })
    }
  />
);

export const reactionKetcherShellAdapter: ReactionEditorAdapter<ReactionKetcherShellValue> = {
  id: "reaction-ketcher-shell",
  createState: (draft) => ({
    draft,
    payload: createReactionKetcherShellValue(draft)
  }),
  exportDraft: async (state) => exportReactionDraftFromKetcherShell(state.payload),
  renderFrame: renderReactionKetcherShellFrame
};
