import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const valueRegistry: Record<string, string[]> = {
  kind: ["molecule", "reaction"],
  status: ["success", "failed", "partial", "pending"],
  stage: [
    "reaction_setup",
    "reaction",
    "workup",
    "purification",
    "analysis"
  ],
  family: [
    "charge",
    "add",
    "stir",
    "heat",
    "cool",
    "quench",
    "extract",
    "wash",
    "dry",
    "concentrate",
    "purify",
    "analyze"
  ]
};

export const getChemdValueCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  const fieldKey = context.isStepFamilyPosition ? "family" : context.fieldKey;
  if ((!context.isFieldValuePosition && !context.isStepFamilyPosition) || !fieldKey) {
    return [];
  }

  const prefix = context.tokenPrefix.toLowerCase();
  const values = valueRegistry[fieldKey] ?? [];
  return values
    .filter((value) => value.toLowerCase().startsWith(prefix))
    .map((value, index) => ({
      id: `value.chemd.${fieldKey}.${value}`,
      label: value,
      kind: "value",
      insertText: value,
      insertTextFormat: "plain",
      detail: `${fieldKey} value`,
      sortText: `${String(index).padStart(2, "0")}-${value}`,
      filterText: value,
      range: context.range
    }));
};
