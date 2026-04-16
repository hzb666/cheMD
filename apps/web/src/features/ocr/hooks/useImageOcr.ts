import { useCallback, useRef, useState } from "react";

import { buildChemdSessionHeaders } from "../../../lib/chemd-session-token";
import type { OcrApplyResult, UnifiedOcrRouteResponse } from "../types";
import { ensureBlockId } from "../lib/ensure-block-id";
import { insertMoleculeBlock } from "../lib/insert-molecule-block";
import { selectTargetMolecule } from "../lib/select-target-molecule";
import { selectTargetReaction } from "../lib/select-target-reaction";
import { updateMoleculeBlock } from "../lib/update-molecule-block";
import { insertReactionBlock } from "../../reaction-editor/lib/insert-reaction-block";
import { updateReactionBlock } from "../../reaction-editor/lib/update-reaction-block";
 
interface UseImageOcrParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  onSourceChange: (nextSource: string) => void;
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
        const initialSource = getLatestSource();
        const initialTarget = selectTargetMolecule(initialSource);
        const initialReactionTarget = selectTargetReaction(initialSource);
        const fallbackBlockId = ensureBlockId(undefined, "chem");

        const formData = new FormData();
        formData.set("documentId", documentId);
        formData.set("fallbackBlockId", fallbackBlockId);
        if (initialTarget?.blockId) {
          formData.set("moleculeBlockId", initialTarget.blockId);
        }
        if (initialReactionTarget?.blockId) {
          formData.set("reactionBlockId", initialReactionTarget.blockId);
        }
        formData.set("sessionId", sessionId);
        formData.set("image", file);

        const response = await fetch("/api/chem/ocr", {
          method: "POST",
          headers: buildChemdSessionHeaders(),
          body: formData
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message ?? `OCR failed (${response.status})`);
        }

        const payload = (await response.json()) as UnifiedOcrRouteResponse;
        const latestSource = getLatestSource();

        if (
          payload.kind === "reaction"
          && payload.reaction?.reactants?.length
          && payload.reaction?.products?.length
        ) {
          const blockId = typeof payload.blockId === "string" && payload.blockId.trim().length > 0
            ? payload.blockId
            : fallbackBlockId;
          const target = selectTargetReaction(latestSource, blockId);
          const action = target ? "update_existing" : "create_new";
          const nextSource = target
            ? updateReactionBlock(latestSource, blockId, payload.reaction)
            : insertReactionBlock(latestSource, blockId, payload.reaction);
          onSourceChange(nextSource);

          const result: OcrApplyResult = {
            nextSource,
            blockId,
            action,
            kind: "reaction",
            reaction: payload.reaction
          };
          setLastResult(result);
          return result;
        }

        const structure = payload.kind === "molecule" ? payload.structure : undefined;

        if (!structure?.smiles) {
          throw new Error("OCR did not return a usable chemistry payload");
        }

        const blockId = typeof payload.blockId === "string" && payload.blockId.trim().length > 0
          ? payload.blockId
          : fallbackBlockId;
        const target = selectTargetMolecule(latestSource, blockId);
        const action = target ? "update_existing" : "create_new";
        const nextSource = target
          ? updateMoleculeBlock(latestSource, blockId, structure.smiles)
          : insertMoleculeBlock(latestSource, blockId, structure.smiles);
        onSourceChange(nextSource);

        const result: OcrApplyResult = {
          nextSource,
          blockId,
          action,
          kind: "molecule",
          smiles: structure.smiles
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
