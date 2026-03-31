import type { ChemRenderResponse } from "../dto";

/**
 * Map a raw chem-service render response to the internal domain shape.
 */
export const mapRenderResponse = (raw: ChemRenderResponse) => ({
  svg: raw.svg,
  warnings: raw.warnings,
});
