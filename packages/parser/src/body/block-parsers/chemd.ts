import type { MoleculeNode, ReactionNode } from "@chemd/core";

import { collectImplicitChemdValue, pickFirstStringArray, pickFirstStringValue } from "../parse-body-shared";
import { parseAllowedFields, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const CHEMD_FIELDS = new Set([
  "smiles",
  "cas",
  "name",
  "role",
  "caption",
  "formula",
  "amount",
  "equivalents",
  "reactants",
  "products",
  "reactant",
  "product",
  "reac",
  "prod",
  "conditions",
  "reagents",
  "catalyst",
  "solvent",
  "temperature",
  "time",
  "pressure",
  "atmosphere",
  "yield",
  "conversion",
  "selectivity"
]);

const hasReactionShape = (fields: Record<string, string | string[]>): boolean => {
  const reactants = pickFirstStringArray(fields, ["reac", "reactant", "reactants"]) ?? [];
  const products = pickFirstStringArray(fields, ["prod", "product", "products"]) ?? [];

  return reactants.length > 0
    || products.length > 0
    || "reac" in fields
    || "prod" in fields
    || "reactant" in fields
    || "product" in fields
    || "reactants" in fields
    || "products" in fields;
};

const createReactionNode = (
  id: string | undefined,
  fields: Record<string, string | string[]>
): ReactionNode => ({
  type: "reaction",
  id,
  reactants: pickFirstStringArray(fields, ["reac", "reactant", "reactants"]) ?? [],
  products: pickFirstStringArray(fields, ["prod", "product", "products"]) ?? [],
  conditions: Array.isArray(fields.conditions) ? fields.conditions : [],
  name: pickFirstStringValue(fields, ["name"]),
  reagents: pickFirstStringValue(fields, ["reagents"]),
  catalyst: pickFirstStringValue(fields, ["catalyst"]),
  solvent: pickFirstStringValue(fields, ["solvent"]),
  temperature: pickFirstStringValue(fields, ["temperature"]),
  time: pickFirstStringValue(fields, ["time"]),
  pressure: pickFirstStringValue(fields, ["pressure"]),
  atmosphere: pickFirstStringValue(fields, ["atmosphere"]),
  yield: pickFirstStringValue(fields, ["yield"]),
  conversion: pickFirstStringValue(fields, ["conversion"]),
  selectivity: pickFirstStringValue(fields, ["selectivity"]),
  caption: pickFirstStringValue(fields, ["caption"])
});

const createMoleculeNode = (
  id: string | undefined,
  lines: string[],
  fields: Record<string, string | string[]>,
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
): MoleculeNode => ({
  type: "molecule",
  id,
  smiles: pickFirstStringValue(fields, ["smiles", "cas"]) ?? collectImplicitChemdValue(lines, diagnostics),
  name: pickFirstStringValue(fields, ["name"]),
  role: pickFirstStringValue(fields, ["role"]),
  caption: pickFirstStringValue(fields, ["caption"]),
  formula: pickFirstStringValue(fields, ["formula"]),
  amount: pickFirstStringValue(fields, ["amount"]),
  equivalents: pickFirstStringValue(fields, ["equivalents"])
});

export const parseChemdBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseAllowedFields(lines, diagnostics, "chemd", CHEMD_FIELDS);

  return hasReactionShape(fields)
    ? createReactionNode(id, fields)
    : createMoleculeNode(id, lines, fields, diagnostics);
};
