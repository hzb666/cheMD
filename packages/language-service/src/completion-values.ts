import {
  getDeclarationFieldSchema,
  type DeclarationFieldValueSchema
} from "@chemd/core";
import { STEP_FAMILIES } from "@chemd/step-ontology";

import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const collectEnumSuggestions = (
  schema: DeclarationFieldValueSchema | undefined
): string[] => {
  if (!schema) return [];
  if (schema.kind === "enum") {
    return [...new Set([...schema.values, ...(schema.suggestions ?? [])])];
  }
  if (schema.kind === "list") {
    return collectEnumSuggestions(schema.item);
  }
  if (schema.kind === "record") {
    return [
      ...collectEnumSuggestions(schema.head),
      ...Object.values(schema.params).flatMap(collectEnumSuggestions)
    ];
  }
  return [];
};

const findSchemaSuggestions = (
  blockType: string | undefined,
  fieldKey: string
): string[] => {
  if (fieldKey === "family") {
    return [...STEP_FAMILIES].sort();
  }
  const schema = blockType ? getDeclarationFieldSchema(blockType, fieldKey) : undefined;
  return collectEnumSuggestions(schema?.value);
};

export const getChemdValueCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  const fieldKey = context.isStepFamilyPosition ? "family" : context.fieldKey;
  if ((!context.isFieldValuePosition && !context.isStepFamilyPosition) || !fieldKey) {
    return [];
  }

  const prefix = context.tokenPrefix.toLowerCase();
  const blockType = context.isStepFamilyPosition ? "step" : context.block?.type;
  const values = findSchemaSuggestions(blockType, fieldKey);
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
