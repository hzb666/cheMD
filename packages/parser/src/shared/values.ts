import { type ChemdMeta } from "@chemd/core";
import { ISO_DATE_PATTERN } from "./patterns";

export const DEFAULT_META: ChemdMeta = {
  id: "draft-document",
  title: "Untitled chemd document",
  date: "1970-01-01"
};

export const REQUIRED_FRONTMATTER_KEYS = ["id", "title", "date"] as const;

export const ALIAS_NAMES = new Set(["reaction", "result", "product", "sample"]);
export const LIST_FIELDS = new Set(["reactants", "products", "params"]);
export const BLOCK_FIELDS: Record<string, Set<string>> = {
  molecule: new Set(["smiles", "name", "role", "caption", "formula", "amount", "equivalents"]),
  reaction: new Set(["reactants", "products", "name", "reagents", "catalyst", "solvent", "temperature", "time", "pressure", "atmosphere", "yield", "conversion", "selectivity", "caption"]),
  result: new Set(["status", "yield", "conversion", "selectivity", "isolated_mass", "product_state", "purity", "notes"]),
  analysis: new Set(["type", "instrument", "solvent", "frequency", "method", "data", "notes"]),
  sample: new Set(["name", "sample_id", "batch", "purity", "supplier", "notes"]),
  template: new Set(["bind", "params", "description"]),
  use: new Set([])
};

export const isValidIsoDateValue = (value: string): boolean => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map((item) => Number(item));
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
};
