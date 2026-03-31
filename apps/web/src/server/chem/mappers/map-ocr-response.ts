import type { ChemOcrResponse } from "../dto";

/**
 * Map a raw chem-service OCR response to the shape returned by the
 * `/api/chem/ocr` route.
 */
export const mapOcrResponse = (
  raw: ChemOcrResponse,
  blockId: string,
  action: "update_existing" | "create_new"
) => ({
  status: raw.smiles ? ("ok" as const) : ("failed" as const),
  blockId,
  action,
  structure: {
    smiles: raw.smiles,
    molfile: raw.molfile ?? undefined,
  },
  confidence: raw.confidence ?? undefined,
  warnings: raw.warnings,
});
