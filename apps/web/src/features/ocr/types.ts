/** Types for the OCR feature. */

export interface OcrResult {
  status: "ok" | "partial" | "failed";
  blockId: string;
  action: "update_existing" | "create_new";
  structure: {
    smiles: string;
    molfile?: string;
  };
  confidence?: number;
  warnings: string[];
}

export type OcrState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "success"; result: OcrResult }
  | { phase: "error"; message: string };
