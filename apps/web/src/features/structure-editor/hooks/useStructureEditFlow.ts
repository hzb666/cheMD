"use client";

import { useCallback, useState } from "react";

import { buildChemdSessionHeaders } from "../../../lib/chemd-session-token";
import { insertMoleculeBlock } from "../../ocr/lib/insert-molecule-block";
import type { StructureEditorDraft } from "../types";
import { loadStructureDraft } from "../lib/load-structure-draft";
import { replaceChemBlock } from "../../chem-editor/lib/replace-chem-block";
import { removeStoredReactionDraft } from "../../reaction-editor/lib/reaction-draft-store";
import {
  buildStructureSaveRequest,
  resolveSavedStructureDraft
} from "../lib/structure-save";
import { saveStoredStructureDraft } from "../lib/structure-draft-store";

interface StructureDraftState {
  blockId: string;
  smiles: string;
  molfile?: string;
}

interface UseStructureEditFlowParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  applySourceChange: (nextSource: string) => void;
  setEditorStatus: (next: string | null) => void;
}

export const useStructureEditFlow = ({
  documentId,
  sessionId,
  getLatestSource,
  applySourceChange,
  setEditorStatus
}: UseStructureEditFlowParams) => {
  const [editingStructure, setEditingStructure] = useState<StructureDraftState | null>(null);

  const handleEditMolecule = useCallback(
    async (blockId: string, smiles: string, previewIsFresh: boolean) => {
      if (!previewIsFresh) {
        setEditorStatus("Preview is updating; wait for compile to finish before editing.");
        return;
      }

      try {
        const draft = await loadStructureDraft({
          documentId,
          blockId,
          sessionId,
          fallbackSmiles: smiles
        });
        setEditingStructure(draft);
      } catch (error) {
        setEditingStructure({ blockId, smiles });
        setEditorStatus(
          error instanceof Error
            ? `${error.message}; fallback to preview structure`
            : "Structure draft load failed; fallback to preview structure"
        );
      }
    },
    [documentId, sessionId, setEditorStatus]
  );

  const handleSaveStructure = useCallback(
    async (next: StructureEditorDraft, blockIdOverride?: string) => {
      const targetBlockId = blockIdOverride ?? editingStructure?.blockId;
      if (!targetBlockId) {
        return;
      }

      const response = await fetch("/api/chem/structure/save", {
        method: "POST",
        headers: buildChemdSessionHeaders({
          "Content-Type": "application/json"
        }),
        body: JSON.stringify({
          documentId,
          blockId: targetBlockId,
          sessionId,
          ...buildStructureSaveRequest(next)
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { smiles?: string; molfile?: string; message?: string }
        | null;
      if (!response.ok || !payload?.smiles) {
        throw new Error(payload?.message ?? `Structure save failed (${response.status})`);
      }

      const savedDraft = resolveSavedStructureDraft(next, {
        smiles: payload.smiles,
        molfile: typeof payload.molfile === "string" ? payload.molfile : undefined
      });
      saveStoredStructureDraft({
        documentId,
        blockId: targetBlockId,
        sessionId,
        smiles: savedDraft.smiles,
        molfile: savedDraft.molfile,
        sourceSmiles: savedDraft.smiles
      });
      removeStoredReactionDraft({
        documentId,
        blockId: targetBlockId,
        sessionId
      });
      const latestSource = getLatestSource();
      const updatedSource = replaceChemBlock(latestSource, targetBlockId, {
        kind: "molecule",
        smiles: savedDraft.smiles,
        molfile: savedDraft.molfile
      });
      const nextSource = updatedSource !== latestSource
        ? updatedSource
        : insertMoleculeBlock(latestSource, targetBlockId, savedDraft.smiles);
      applySourceChange(nextSource);
      setEditorStatus(`Structure updated for #${targetBlockId}`);
      setEditingStructure(null);
    },
    [
      applySourceChange,
      documentId,
      editingStructure,
      getLatestSource,
      sessionId,
      setEditorStatus
    ]
  );

  return {
    editingStructure,
    closeStructureDialog: () => setEditingStructure(null),
    handleEditMolecule,
    handleSaveStructure
  };
};
