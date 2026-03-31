import type { RenderPayload } from "../types";

/**
 * Build the request payload for the `/api/chem/render` endpoint.
 */
export const buildRenderPayload = (smiles?: string, molfile?: string): RenderPayload => ({
  kind: "molecule",
  smiles,
  molfile,
});
