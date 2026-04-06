import type { StructureEditorDraft } from "../types";

interface StructureSaveResponse {
  smiles: string;
  molfile?: string;
}

export const buildStructureSaveRequest = (value: StructureEditorDraft): StructureSaveResponse => ({
  smiles: value.smiles,
  molfile: value.molfile
});

export const resolveSavedStructureDraft = (
  _currentDraft: StructureEditorDraft,
  response: StructureSaveResponse
): StructureEditorDraft => ({
  smiles: response.smiles,
  molfile: response.molfile
});
