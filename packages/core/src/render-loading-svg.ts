export type ChemRenderKind = "molecule" | "reaction";

const getChemRenderLoadingLabel = (kind: ChemRenderKind): string =>
  kind === "reaction"
    ? "RDKit reaction rendering in progress"
    : "RDKit molecule rendering in progress";

export const buildChemRenderLoadingSvg = (kind: ChemRenderKind): string => {
  const label = getChemRenderLoadingLabel(kind);

  return `<svg class="chemd-loading-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" role="img" aria-label="${label}"><circle cx="12" cy="12" r="9" fill="none" stroke="#cbd5e1" stroke-width="2.2" /><circle cx="12" cy="12" r="9" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="16 57"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" /></circle></svg>`;
};
