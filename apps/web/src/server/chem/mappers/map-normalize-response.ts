import type { ChemNormalizeResponse } from "../dto";

/**
 * Map a raw chem-service normalize response to the internal domain shape.
 */
export const mapNormalizeResponse = (raw: ChemNormalizeResponse) => ({
  canonicalSmiles: raw.canonical_smiles,
  normalizedMolfile: raw.normalized_molfile ?? undefined,
  warnings: raw.warnings,
});
