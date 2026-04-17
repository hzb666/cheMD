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

interface OcrFormParams {
  documentId: string;
  sessionId: string;
  source: string;
  fallbackBlockId: string;
  file: File;
}

const readResponseMessage = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  return payload.message ?? `OCR failed (${response.status})`;
};

const resolveBlockId = (blockId: unknown, fallbackBlockId: string): string =>
  typeof blockId === "string" && blockId.trim().length > 0 ? blockId : fallbackBlockId;

const createOcrFormData = ({
  documentId,
  sessionId,
  source,
  fallbackBlockId,
  file
}: OcrFormParams): FormData => {
  const initialTarget = selectTargetMolecule(source);
  const initialReactionTarget = selectTargetReaction(source);
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

  return formData;
};

const applyReactionOcrPayload = (
  payload: UnifiedOcrRouteResponse,
  latestSource: string,
  fallbackBlockId: string
): OcrApplyResult | null => {
  if (payload.kind !== "reaction" || !payload.reaction?.reactants?.length || !payload.reaction?.products?.length) {
    return null;
  }

  const blockId = resolveBlockId(payload.blockId, fallbackBlockId);
  const target = selectTargetReaction(latestSource, blockId);
  const nextSource = target
    ? updateReactionBlock(latestSource, blockId, payload.reaction)
    : insertReactionBlock(latestSource, blockId, payload.reaction);

  return {
    nextSource,
    blockId,
    action: target ? "update_existing" : "create_new",
    kind: "reaction",
    reaction: payload.reaction
  };
};

const applyMoleculeOcrPayload = (
  payload: UnifiedOcrRouteResponse,
  latestSource: string,
  fallbackBlockId: string
): OcrApplyResult => {
  const structure = payload.kind === "molecule" ? payload.structure : undefined;
  if (!structure?.smiles) {
    throw new Error("OCR did not return a usable chemistry payload");
  }

  const blockId = resolveBlockId(payload.blockId, fallbackBlockId);
  const target = selectTargetMolecule(latestSource, blockId);
  const nextSource = target
    ? updateMoleculeBlock(latestSource, blockId, structure.smiles)
    : insertMoleculeBlock(latestSource, blockId, structure.smiles);

  return {
    nextSource,
    blockId,
    action: target ? "update_existing" : "create_new",
    kind: "molecule",
    smiles: structure.smiles
  };
};

const applyOcrPayload = (
  payload: UnifiedOcrRouteResponse,
  latestSource: string,
  fallbackBlockId: string
): OcrApplyResult =>
  applyReactionOcrPayload(payload, latestSource, fallbackBlockId)
  ?? applyMoleculeOcrPayload(payload, latestSource, fallbackBlockId);

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
        const fallbackBlockId = ensureBlockId(undefined, "chem");

        // fallbackBlockId 要随请求发给 OCR route，确保服务端创建和客户端 patch 使用同一个 block id。
        const formData = createOcrFormData({
          documentId,
          sessionId,
          source: initialSource,
          fallbackBlockId,
          file
        });
        const response = await fetch("/api/chem/ocr", {
          method: "POST",
          headers: buildChemdSessionHeaders(),
          body: formData
        });

        if (!response.ok) {
          throw new Error(await readResponseMessage(response));
        }

        const payload = (await response.json()) as UnifiedOcrRouteResponse;
        const result = applyOcrPayload(payload, getLatestSource(), fallbackBlockId);
        onSourceChange(result.nextSource);
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
