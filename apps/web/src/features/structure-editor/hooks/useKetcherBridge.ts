import { useCallback } from "react";

import type { KetcherDialogValue } from "../types";

interface UseKetcherBridgeResult {
  exportDraft: (value: KetcherDialogValue) => Promise<KetcherDialogValue>;
  importDraft: (value: KetcherDialogValue) => KetcherDialogValue;
}

export const normalizeKetcherDraft = (value: KetcherDialogValue): KetcherDialogValue => ({
  smiles: value.smiles.trim(),
  molfile: typeof value.molfile === "string" ? value.molfile.trim() || undefined : undefined
});

export const normalizeKetcherFrameValue = (value: KetcherDialogValue): KetcherDialogValue =>
  normalizeKetcherDraft(value);

export const createKetcherBridgeValue = (value: KetcherDialogValue): KetcherDialogValue =>
  normalizeKetcherFrameValue(value);

export const useKetcherBridge = (): UseKetcherBridgeResult => {
  const exportDraft = useCallback(async (value: KetcherDialogValue) => {
    return normalizeKetcherDraft(value);
  }, []);

  const importDraft = useCallback((value: KetcherDialogValue) => {
    return createKetcherBridgeValue(value);
  }, []);

  return { exportDraft, importDraft };
};
