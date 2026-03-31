/** Types for the chem-preview feature. */

export interface RenderPreviewState {
  phase: "idle" | "loading" | "success" | "error";
  svg?: string;
  warnings?: string[];
  errorMessage?: string;
}

export interface RenderPayload {
  kind: "molecule";
  smiles?: string;
  molfile?: string;
}
