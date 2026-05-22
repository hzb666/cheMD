export const normalizeChemicalName = (input: string): string =>
  input
    .normalize("NFKC")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const escapeRegExp = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createAliasPattern = (alias: string): RegExp => {
  const escaped = escapeRegExp(alias.trim()).replace(/\\ /g, "\\s+");
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "giu");
};
