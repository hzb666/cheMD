import { useCallback } from "react";

interface UseKetcherBridgeResult {
  exportDraft: () => Promise<{ smiles?: string; molfile?: string }>;
}

export const useKetcherBridge = (): UseKetcherBridgeResult => {
  const exportDraft = useCallback(async () => {
    return {
      smiles: undefined,
      molfile: undefined
    };
  }, []);

  return { exportDraft };
};
