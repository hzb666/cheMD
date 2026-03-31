import { useCallback, useState } from "react";

import type { OcrApplyResult } from "../types";
import { ensureBlockId } from "../lib/ensure-block-id";
import { insertMoleculeBlock } from "../lib/insert-molecule-block";
import { selectTargetMolecule } from "../lib/select-target-molecule";
import { updateMoleculeBlock } from "../lib/update-molecule-block";

interface UseImageOcrParams {
  source: string;
  documentId: string;
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

export const useImageOcr = ({ source, documentId, onSourceChange }: UseImageOcrParams): UseImageOcrResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<OcrApplyResult | null>(null);

  const runOcr = useCallback(
    async (file: File): Promise<OcrApplyResult | null> => {
      setLoading(true);
      setError(null);

      try {
        const target = selectTargetMolecule(source);
        const blockId = ensureBlockId(target?.blockId);

        const formData = new FormData();
        formData.set("documentId", documentId);
        formData.set("blockId", blockId);
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

        const action = target ? "update_existing" : "create_new";
        const nextSource = target
          ? updateMoleculeBlock(source, blockId, payload.structure.smiles)
          : insertMoleculeBlock(source, blockId, payload.structure.smiles);

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
        setLoading(false);
      }
    },
    [documentId, onSourceChange, source]
  );

  return {
    loading,
    error,
    lastResult,
    runOcr
  };
};
