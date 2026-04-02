import type { KetcherDialogValue } from "../types";

interface StructureSaveResponse {
  smiles: string;
  molfile?: string;
}

export const buildStructureSaveRequest = (value: KetcherDialogValue): StructureSaveResponse => ({
  smiles: value.smiles,
  molfile: value.molfile
});

export const resolveSavedStructureDraft = (
  currentDraft: KetcherDialogValue,
  response: StructureSaveResponse
): KetcherDialogValue => ({
  smiles: response.smiles,
  molfile: response.molfile ?? currentDraft.molfile
});
