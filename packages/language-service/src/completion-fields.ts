import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionItem
} from "./completion-types";

const commonFields = ["kind", "name", "caption"];
const fieldRegistry: Record<Exclude<ChemdCompletionBlockKind, "unknown">, string[]> = {
  molecule: [
    "kind",
    "name",
    "smiles",
    "cas",
    "formula",
    "amount",
    "equivalents",
    "role",
    "caption"
  ],
  reaction: [
    "kind",
    "name",
    "stage",
    "route",
    "prev",
    "reactants",
    "products",
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
  ],
  result: ["status", "yield", "conversion", "selectivity", "reaction", "product", "notes"],
  procedure: ["ref", "reaction", "evidence", "step"],
  step: ["family", "stage", "purpose", "inputs", "outputs", "dependsOn", "evidence", "confidence"],
  template: ["params", "bind", "description", "body"],
  use: [],
  condition_varies: ["reaction", "standard", "condition", "varies", "notes", "var1", "res1", "note1"]
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
