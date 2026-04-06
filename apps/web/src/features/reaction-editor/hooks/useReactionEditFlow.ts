"use client";

import { useCallback, useState } from "react";

import { buildChemdSessionHeaders } from "../../../lib/chemd-session-token";
import { replaceChemBlock } from "../../chem-editor/lib/replace-chem-block";
import type { ReactionEditorDraftWithBlockId } from "../types";
import { loadReactionDraft } from "../lib/load-reaction-draft";
import {
  createReactionSourceKey,
  removeStoredReactionDraft,
  saveStoredReactionDraft
} from "../lib/reaction-draft-store";
import { insertReactionBlock } from "../lib/insert-reaction-block";
import {
  buildReactionSaveRequest,
  resolveSavedReactionDraft
} from "../lib/reaction-save";
import { removeStoredStructureDraft } from "../../structure-editor/lib/structure-draft-store";

interface UseReactionEditFlowParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  applySourceChange: (nextSource: string) => void;
  setEditorStatus: (next: string | null) => void;
}

export const useReactionEditFlow = ({
  documentId,
  sessionId,
  getLatestSource,
  applySourceChange,
  setEditorStatus
}: UseReactionEditFlowParams) => {
  const [editingReaction, setEditingReaction] = useState<ReactionEditorDraftWithBlockId | null>(null);

  const handleEditReaction = useCallback(
    async (
      blockId: string,
      reactants: string[],
      products: string[],
      conditions: string[],
      previewIsFresh: boolean
    ) => {
      if (!previewIsFresh) {
        setEditorStatus("Preview is updating; wait for compile to finish before editing.");
        return;
      }

      try {
        const draft = await loadReactionDraft({
          documentId,
          blockId,
          sessionId,
          fallback: {
            reactants,
            products,
            conditions
          }
        });
        setEditingReaction(draft);
      } catch (error) {
        setEditingReaction({
          blockId,
          reactants,
          products,
          conditions
        });
        setEditorStatus(
          error instanceof Error
            ? `${error.message}; fallback to preview reaction`
            : "Reaction draft load failed; fallback to preview reaction"
        );
      }
    },
    [documentId, sessionId, setEditorStatus]
  );

  const handleSaveReaction = useCallback(
    async (next: ReactionEditorDraftWithBlockId) => {
      const response = await fetch("/api/chem/reaction/save", {
        method: "POST",
        headers: buildChemdSessionHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          documentId,
          blockId: next.blockId,
          sessionId,
          ...buildReactionSaveRequest(next)
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            blockId?: string;
            reactants?: string[];
            products?: string[];
            conditions?: string[];
            message?: string;
          }
        | null;
      if (
        !response.ok
        || !payload?.blockId
        || !Array.isArray(payload.reactants)
        || !Array.isArray(payload.products)
        || !Array.isArray(payload.conditions)
      ) {
        throw new Error(payload?.message ?? `Reaction save failed (${response.status})`);
      }

      const savedDraft = resolveSavedReactionDraft(next, {
        reactants: payload.reactants,
        products: payload.products,
        conditions: payload.conditions
      });
      saveStoredReactionDraft({
        documentId,
        blockId: payload.blockId,
        sessionId,
        reactants: savedDraft.reactants,
        products: savedDraft.products,
        conditions: savedDraft.conditions,
        sourceReactionKey: createReactionSourceKey(savedDraft),
        draftReactionKey: createReactionSourceKey(savedDraft)
      });
      removeStoredStructureDraft({
        documentId,
        blockId: payload.blockId,
        sessionId
      });
      const latestSource = getLatestSource();
      const updatedSource = replaceChemBlock(latestSource, payload.blockId, {
        kind: "reaction",
        reactants: savedDraft.reactants,
        products: savedDraft.products,
        conditions: savedDraft.conditions
      });
      const nextSource = updatedSource !== latestSource
        ? updatedSource
        : insertReactionBlock(latestSource, payload.blockId, {
            reactants: savedDraft.reactants,
            products: savedDraft.products,
            conditions: savedDraft.conditions
          });
      applySourceChange(nextSource);
      setEditorStatus(`Reaction updated for #${payload.blockId}`);
      removeStoredReactionDraft({
        documentId,
        blockId: next.blockId,
        sessionId
      });
      setEditingReaction(null);
    },
    [applySourceChange, documentId, getLatestSource, sessionId, setEditorStatus]
  );

  return {
    editingReaction,
    closeReactionDialog: () => setEditingReaction(null),
    handleEditReaction,
    handleSaveReaction
  };
};
