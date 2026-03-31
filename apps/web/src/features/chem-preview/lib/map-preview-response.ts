/**
 * Map the raw JSON response from `/api/chem/render` to the internal
 * preview domain shape.
 */
export const mapPreviewResponse = (raw: { svg: string; warnings: string[] }) => ({
  svg: raw.svg,
  warnings: raw.warnings,
});
