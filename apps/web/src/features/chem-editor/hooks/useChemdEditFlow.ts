"use client";

import { useCallback, useState } from "react";

import { buildChemdSessionHeaders } from "../../../lib/chemd-session-token";
import { buildChemEditorSaveRequest } from "../lib/chem-editor-save";
import { loadChemdDraft } from "../lib/load-chemd-draft";
import { replaceChemBlock } from "../lib/replace-chem-block";
import type { ChemEditorDraftWithBlockId } from "../types";

interface UseChemdEditFlowParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  applySourceChange: (nextSource: string) => void;
  setEditorStatus: (next: string | null) => void;
}

export const useChemdEditFlow = ({
  documentId,
  sessionId,
  getLatestSource,
  applySourceChange,
  setEditorStatus
}: UseChemdEditFlowParams) => {
  const [editingChemd, setEditingChemd] = useState<ChemEditorDraftWithBlockId | null>(null);

  const handleEditChemd = useCallback(
    async (draft: ChemEditorDraftWithBlockId, previewIsFresh: boolean) => {
      if (!previewIsFresh) {
        setEditorStatus("Preview is updating; wait for compile to finish before editing.");
        return;
      }

      try {
        const nextDraft = await loadChemdDraft({
          documentId,
          blockId: draft.blockId,
          sessionId,
          fallback: draft
        });
        setEditingChemd(nextDraft);
      } catch (error) {
        setEditingChemd(draft);
        setEditorStatus(
          error instanceof Error
            ? `${error.message}; fallback to preview chemistry`
            : "Chemd draft load failed; fallback to preview chemistry"
        );
      }
    },
    [documentId, sessionId, setEditorStatus]
  );

  const handleSaveChemd = useCallback(
    async (next: ChemEditorDraftWithBlockId) => {
      const request = buildChemEditorSaveRequest(next);
      const response = await fetch(request.endpoint, {
        method: "POST",
        headers: buildChemdSessionHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          documentId,
          sessionId,
          ...request.payload
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; type?: unknown; smiles?: unknown; molfile?: unknown; reactants?: unknown; products?: unknown; conditions?: unknown; reactionSmiles?: unknown; rxnfile?: unknown }
        | null;

      if (!response.ok || !payload || payload.type !== request.payload.type) {
        throw new Error(payload?.message ?? `Chemd save failed (${response.status})`);
      }

      const savedDraft: ChemEditorDraftWithBlockId = payload.type === "reaction"
        ? {
            blockId: next.blockId,
            kind: "reaction",
            reactants: Array.isArray(payload.reactants)
              ? payload.reactants.filter((item): item is string => typeof item === "string")
              : next.kind === "reaction"
                ? next.reactants
                : [],
            products: Array.isArray(payload.products)
              ? payload.products.filter((item): item is string => typeof item === "string")
              : next.kind === "reaction"
                ? next.products
                : [],
            conditions: Array.isArray(payload.conditions)
              ? payload.conditions.filter((item): item is string => typeof item === "string")
              : next.kind === "reaction"
                ? next.conditions
                : [],
            reactionSmiles:
              typeof payload.reactionSmiles === "string" ? payload.reactionSmiles : undefined,
            rxnfile:
              typeof payload.rxnfile === "string" ? payload.rxnfile : undefined
          }
        : {
            blockId: next.blockId,
            kind: "molecule",
            smiles:
              typeof payload.smiles === "string"
                ? payload.smiles
                : next.kind === "molecule"
                  ? next.smiles
                  : "",
            molfile:
              typeof payload.molfile === "string" ? payload.molfile : undefined
      };

      const latestSource = getLatestSource();
      const nextSource = replaceChemBlock(latestSource, next.blockId, savedDraft);
      if (nextSource === null) {
        throw new Error(`Chemd block #${next.blockId} no longer exists in the source`);
      }
      applySourceChange(nextSource);
      setEditorStatus(`Chem updated for #${next.blockId}`);
      setEditingChemd(null);
    },
    [applySourceChange, documentId, getLatestSource, sessionId, setEditorStatus]
  );

  return {
    editingChemd,
    closeChemdDialog: () => setEditingChemd(null),
    handleEditChemd,
    handleSaveChemd
  };
};
