"use client";

import { useCallback } from "react";

interface OcrLikeResult {
  blockId: string;
  action: "update_existing" | "create_new";
}

interface OcrLikeHook<TResult extends OcrLikeResult> {
  loading: boolean;
  error: string | null;
  runOcr: (file: File) => Promise<TResult | null>;
}

interface UseChemOcrActionsParams<
  TMoleculeResult extends OcrLikeResult,
  TReactionResult extends OcrLikeResult
> {
  moleculeOcr: OcrLikeHook<TMoleculeResult>;
  reactionOcr: OcrLikeHook<TReactionResult>;
  setEditorStatus: (next: string | null) => void;
}

export const useChemOcrActions = <
  TMoleculeResult extends OcrLikeResult,
  TReactionResult extends OcrLikeResult
>({
  moleculeOcr,
  reactionOcr,
  setEditorStatus
}: UseChemOcrActionsParams<TMoleculeResult, TReactionResult>) => {
  const ocrBusy = moleculeOcr.loading || reactionOcr.loading;

  const applyMoleculeOcrFile = useCallback(
    (file: File) => {
      if (ocrBusy) {
        return;
      }

      void moleculeOcr.runOcr(file).then((next) => {
        if (!next) {
          setEditorStatus("OCR failed");
          return;
        }

        setEditorStatus(
          next.action === "create_new"
            ? `OCR created molecule block #${next.blockId}`
            : `OCR updated molecule block #${next.blockId}`
        );
      });
    },
    [moleculeOcr, ocrBusy, setEditorStatus]
  );

  const applyReactionOcrFile = useCallback(
    (file: File) => {
      if (ocrBusy) {
        return;
      }

      void reactionOcr.runOcr(file).then((next) => {
        if (!next) {
          setEditorStatus("Reaction OCR failed");
          return;
        }

        setEditorStatus(
          next.action === "create_new"
            ? `OCR created reaction block #${next.blockId}`
            : `OCR updated reaction block #${next.blockId}`
        );
      });
    },
    [ocrBusy, reactionOcr, setEditorStatus]
  );

  return {
    ocrBusy,
    applyMoleculeOcrFile,
    applyReactionOcrFile
  };
};
