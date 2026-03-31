"use client";

import { useCallback, useState } from "react";

import type { OcrResult, OcrState } from "../types";

interface UseImageOcrOptions {
  documentId?: string;
  blockId?: string;
}

interface UseImageOcrReturn {
  state: OcrState;
  runOcr: (file: File) => Promise<OcrResult | null>;
  reset: () => void;
}

/**
 * Hook that sends an image file to `/api/chem/ocr` and tracks the request
 * lifecycle state.
 */
export const useImageOcr = ({
  documentId = "default",
  blockId = "",
}: UseImageOcrOptions = {}): UseImageOcrReturn => {
  const [state, setState] = useState<OcrState>({ phase: "idle" });

  const runOcr = useCallback(
    async (file: File): Promise<OcrResult | null> => {
      setState({ phase: "loading" });

      try {
        const form = new FormData();
        form.append("file", file);
        form.append("documentId", documentId);
        if (blockId) {
          form.append("blockId", blockId);
        }

        const response = await fetch("/api/chem/ocr", {
          method: "POST",
          body: form,
        });

        if (!response.ok) {
          const errorBody = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(errorBody.message ?? `OCR failed (${response.status})`);
        }

        const result = (await response.json()) as OcrResult;
        setState({ phase: "success", result });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "OCR failed";
        setState({ phase: "error", message });
        return null;
      }
    },
    [documentId, blockId]
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, runOcr, reset };
};
