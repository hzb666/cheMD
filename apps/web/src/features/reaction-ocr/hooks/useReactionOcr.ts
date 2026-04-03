import { useCallback, useRef, useState } from "react";

import { ensureBlockId } from "../../ocr/lib/ensure-block-id";
import { insertReactionBlock } from "../../reaction-editor/lib/insert-reaction-block";
import { updateReactionBlock } from "../../reaction-editor/lib/update-reaction-block";

interface UseReactionOcrParams {
  documentId: string;
  sessionId: string;
  getLatestSource: () => string;
  onSourceChange: (nextSource: string) => void;
}

interface ReactionTarget {
  blockId: string;
}

interface ReactionOcrApiResponse {
  status: "ok" | "partial" | "failed";
  reaction?: {
    reactants: string[];
    products: string[];
    conditions: string[];
  };
}

export interface ReactionOcrApplyResult {
  nextSource: string;
  blockId: string;
  action: "update_existing" | "create_new";
  reaction: {
    reactants: string[];
    products: string[];
    conditions: string[];
  };
}

interface UseReactionOcrResult {
  loading: boolean;
  error: string | null;
  lastResult: ReactionOcrApplyResult | null;
  runOcr: (file: File) => Promise<ReactionOcrApplyResult | null>;
}

const REACTION_OPEN_RE = /^:::reaction(?:\s+#([^\s]+))?/;
const REACTION_CLOSE_RE = /^:::$/;

const selectTargetReaction = (source: string, preferredBlockId?: string): ReactionTarget | null => {
  const lines = source.split(/\r?\n/);
  const candidates: ReactionTarget[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const openMatch = line.match(REACTION_OPEN_RE);
    if (!openMatch) {
      continue;
    }

    candidates.push({ blockId: ensureBlockId(openMatch[1], "rxn") });

    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (REACTION_CLOSE_RE.test(lines[scan] ?? "")) {
        index = scan;
        break;
      }
    }
  }

  if (preferredBlockId) {
    return candidates.find((candidate) => candidate.blockId === preferredBlockId) ?? null;
  }

  return candidates.length === 1 ? candidates[0] : null;
};

export const useReactionOcr = ({
  documentId,
  sessionId,
  getLatestSource,
  onSourceChange
}: UseReactionOcrParams): UseReactionOcrResult => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ReactionOcrApplyResult | null>(null);
  const loadingRef = useRef(false);

  const runOcr = useCallback(
    async (file: File): Promise<ReactionOcrApplyResult | null> => {
      if (loadingRef.current) {
        return null;
      }

      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const initialTarget = selectTargetReaction(getLatestSource());
        const requestedBlockId = ensureBlockId(initialTarget?.blockId, "rxn");

        const formData = new FormData();
        formData.set("documentId", documentId);
        formData.set("blockId", requestedBlockId);
        formData.set("sessionId", sessionId);
        formData.set("image", file);

        const response = await fetch("/api/chem/reaction/ocr", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(payload.message ?? `Reaction OCR failed (${response.status})`);
        }

        const payload = (await response.json()) as ReactionOcrApiResponse;
        if (!payload.reaction?.reactants?.length || !payload.reaction?.products?.length) {
          throw new Error("OCR did not return a reaction payload");
        }

        const latestSource = getLatestSource();
        const target = selectTargetReaction(latestSource, initialTarget?.blockId);
        const blockId = target?.blockId ?? requestedBlockId;
        const action = target ? "update_existing" : "create_new";
        const nextSource = target
          ? updateReactionBlock(latestSource, blockId, payload.reaction)
          : insertReactionBlock(latestSource, blockId, payload.reaction);

        onSourceChange(nextSource);

        const result: ReactionOcrApplyResult = {
          nextSource,
          blockId,
          action,
          reaction: payload.reaction
        };
        setLastResult(result);
        return result;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Reaction OCR failed");
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
