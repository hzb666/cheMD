import { getCanonicalBlockFields } from "@chemd/core";

import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionItem
} from "./completion-types";

const commonFields = ["kind", "name", "caption"];

const moleculeFieldNames = new Set([
  "kind",
  "name",
  "smiles",
  "cas",
  "inchi",
  "inchikey",
  "canonical_smiles",
  "formula",
  "mw",
  "role",
  "caption"
]);
const reactionFieldNames = new Set([
  "kind",
  "name",
  "route",
  "prev",
  "reactant",
  "product",
  "equation",
  "rxn_smiles",
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
  "selectivity",
  "caption"
]);

const filterChemdFields = (allowed: ReadonlySet<string>): string[] =>
  getCanonicalBlockFields("chemd").filter((field) => allowed.has(field));

const fieldRegistry: Record<Exclude<ChemdCompletionBlockKind, "unknown">, string[]> = {
  molecule: filterChemdFields(moleculeFieldNames),
  reaction: filterChemdFields(reactionFieldNames),
  material: getCanonicalBlockFields("material"),
  batch: getCanonicalBlockFields("batch"),
  result: getCanonicalBlockFields("result"),
  procedure: [...getCanonicalBlockFields("procedure"), "step"],
  step: getCanonicalBlockFields("step"),
  template: getCanonicalBlockFields("template"),
  use: getCanonicalBlockFields("use"),
  condition_varies: [
    ...getCanonicalBlockFields("condition-varies"),
    "var1",
    "res1",
    "note1"
  ]
};

export const getChemdFieldCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  const block = context.block;
  if (!block || !context.isFieldKeyPosition) {
    return [];
  }

  return getFieldsForKind(block.kind)
    .filter((field) => !block.fields.has(field))
    .filter((field) => field.startsWith(context.fieldPrefix))
    .map((field, index) => ({
      id: `field.chemd.${block.kind}.${field}`,
      label: `${field}:`,
      kind: "field",
      insertText: `${field}: `,
      insertTextFormat: "plain",
      detail: `${block.kind} field`,
      sortText: `${String(index).padStart(2, "0")}-${field}`,
      filterText: field,
      range: {
        ...context.range,
        startColumn: Math.max(1, context.position.column - context.fieldPrefix.length)
      }
    }));
};

const getFieldsForKind = (kind: ChemdCompletionBlockKind): string[] => {
  if (kind !== "unknown") {
    return fieldRegistry[kind];
  }

  return commonFields;
};
