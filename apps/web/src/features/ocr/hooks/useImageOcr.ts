import { useCallback, useRef, useState } from "react";

import { buildChemdSessionHeaders } from "../../../lib/chemd-session-token";
import type { OcrApplyResult, UnifiedOcrRouteResponse } from "../types";
import { ensureBlockId } from "../lib/ensure-block-id";
import { insertMoleculeBlock } from "../lib/insert-molecule-block";
import { selectTargetMolecule } from "../lib/select-target-molecule";
import { selectTargetReaction } from "../lib/select-target-reaction";
import { updateMoleculeBlock } from "../lib/update-molecule-block";
import { saveStoredStructureDraft } from "../../structure-editor/lib/structure-draft-store";
import { insertReactionBlock } from "../../reaction-editor/lib/insert-reaction-block";
import { saveStoredReactionDraft } from "../../reaction-editor/lib/reaction-draft-store";
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
        const initialTarget = selectTargetMolecule(getLatestSource());
        const initialReactionTarget = selectTargetReaction(getLatestSource());
        const requestedBlockId = ensureBlockId(
          initialReactionTarget?.blockId ?? initialTarget?.blockId,
          initialReactionTarget ? "rxn" : initialTarget ? "mol" : "ocr"
        );

        const formData = new FormData();
        formData.set("documentId", documentId);
        formData.set("blockId", requestedBlockId);
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
          const target = selectTargetReaction(latestSource, initialReactionTarget?.blockId);
          const blockId = target?.blockId ?? requestedBlockId;
          const action = target ? "update_existing" : "create_new";
          const nextSource = target
            ? updateReactionBlock(latestSource, blockId, payload.reaction)
            : insertReactionBlock(latestSource, blockId, payload.reaction);

          saveStoredReactionDraft({
            documentId,
            blockId,
            sessionId,
            reactants: payload.reaction.reactants,
            products: payload.reaction.products,
            conditions: payload.reaction.conditions
          });
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

        const target = selectTargetMolecule(latestSource, initialTarget?.blockId);
        const blockId = target?.blockId ?? requestedBlockId;
        const action = target ? "update_existing" : "create_new";
        const nextSource = target
          ? updateMoleculeBlock(latestSource, blockId, structure.smiles)
          : insertMoleculeBlock(latestSource, blockId, structure.smiles);

        saveStoredStructureDraft({
          documentId,
          blockId,
          sessionId,
          smiles: structure.smiles,
          molfile: structure.molfile,
          sourceSmiles: structure.smiles
        });
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
