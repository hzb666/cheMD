/**
 * Data Transfer Objects for the chem-service HTTP API.
 *
 * These types describe the raw JSON shapes sent to and received from the
 * Python chem-service. They are separate from the frontend domain types so
 * that the HTTP boundary is explicit and easy to evolve independently.
 */

// ─── Outbound request shapes ────────────────────────────────────────────────

export interface ChemNormalizeRequest {
  smiles?: string;
  molfile?: string;
}

export interface ChemRenderRequest {
  smiles?: string;
  molfile?: string;
  width?: number;
  height?: number;
}

// ─── Inbound response shapes ─────────────────────────────────────────────────

export interface ChemOcrResponse {
  smiles: string;
  molfile: string | null;
  confidence: number | null;
  warnings: string[];
}

export interface ChemNormalizeResponse {
  canonical_smiles: string;
  normalized_molfile: string | null;
  warnings: string[];
}

export interface ChemRenderResponse {
  svg: string;
  warnings: string[];
}

export interface ChemErrorResponse {
  error: string;
}
