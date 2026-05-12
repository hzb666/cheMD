import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const valueRegistry: Record<string, string[]> = {
  kind: ["molecule", "reaction"],
  stage: [
    "reaction_setup",
    "reaction",
    "workup",
    "purification",
    "analysis"
  ]
};

export const getChemdValueCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  if (!context.isChemdBlock || !context.isFieldValuePosition || !context.fieldKey) {
    return [];
  }

  const prefix = context.tokenPrefix.toLowerCase();
  const values = valueRegistry[context.fieldKey] ?? [];
  return values
    .filter((value) => value.toLowerCase().startsWith(prefix))
    .map((value, index) => ({
      id: `value.chemd.${context.fieldKey}.${value}`,
      label: value,
      kind: "value",
      insertText: value,
      insertTextFormat: "plain",
      detail: `${context.fieldKey} value`,
      sortText: `${String(index).padStart(2, "0")}-${value}`,
      filterText: value,
      range: context.range
    }));
};
