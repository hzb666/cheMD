import { useCallback, useRef, useState } from "react";

import type { OcrApplyResult } from "../types";
import { ensureBlockId } from "../lib/ensure-block-id";
import { insertMoleculeBlock } from "../lib/insert-molecule-block";
import { selectTargetMolecule } from "../lib/select-target-molecule";
import { updateMoleculeBlock } from "../lib/update-molecule-block";
import { saveStoredStructureDraft } from "../../structure-editor/lib/structure-draft-store";

interface UseImageOcrParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  onSourceChange: (nextSource: string) => void;
}

interface OcrApiResponse {
  status: "ok" | "partial" | "failed";
  blockId?: string;
  structure?: {
    smiles: string;
    molfile?: string;
  };
}

interface UseImageOcrResult {
  loading: boolean;
  error: string | null;
  lastResult: OcrApplyResult | null;
  runOcr: (file: File) => Promise<OcrApplyResult | null>;
}

export const useImageOcr = ({
  documentId,
  sessionId,
  getLatestSource,
  onSourceChange
}: UseImageOcrParams): UseImageOcrResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OcrApplyResult | null>(null);
  const loadingRef = useRef(false);

  const runOcr = useCallback(
    async (file: File): Promise<OcrApplyResult | null> => {
      if (loadingRef.current) {
        return null;
      }

      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const initialTarget = selectTargetMolecule(getLatestSource());
        const requestedBlockId = ensureBlockId(initialTarget?.blockId);

        const formData = new FormData();
        formData.set("documentId", documentId);
        formData.set("blockId", requestedBlockId);
        formData.set("sessionId", sessionId);
        formData.set("image", file);

        const response = await fetch("/api/chem/ocr", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message ?? `OCR failed (${response.status})`);
        }

        const payload = (await response.json()) as OcrApiResponse;
        if (!payload.structure?.smiles) {
          throw new Error("OCR did not return a molecule smiles");
        }

        const latestSource = getLatestSource();
        const target = selectTargetMolecule(latestSource, initialTarget?.blockId);
        const blockId = target?.blockId ?? requestedBlockId;
        const action = target ? "update_existing" : "create_new";
        const nextSource = target
          ? updateMoleculeBlock(latestSource, blockId, payload.structure.smiles)
          : insertMoleculeBlock(latestSource, blockId, payload.structure.smiles);

        saveStoredStructureDraft({
          documentId,
          blockId,
          smiles: payload.structure.smiles,
          molfile: payload.structure.molfile,
          sourceSmiles: payload.structure.smiles
        });
        onSourceChange(nextSource);

        const result: OcrApplyResult = {
          nextSource,
          blockId,
          action,
          smiles: payload.structure.smiles
        };
        setLastResult(result);
        return result;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "OCR failed");
        return null;
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [documentId, getLatestSource, onSourceChange, sessionId]
  );

  return {
    loading,
    error,
    lastResult,
    runOcr
  };
};
