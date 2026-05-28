import {
  BLOCK_SCHEMAS,
  getFieldValueSuggestions
} from "@chemd/core";

import type { ChemdCompletionContext, ChemdCompletionItem } from "./completion-types";

const toSchemaBlockType = (blockType: string | undefined): string | undefined =>
  blockType === "condition_varies" ? "condition-varies" : blockType;

const findSchemaSuggestions = (
  blockType: string | undefined,
  fieldKey: string
): string[] => {
  const scopedBlockType = toSchemaBlockType(blockType);
  const scoped = scopedBlockType
    ? getFieldValueSuggestions(scopedBlockType, fieldKey)
    : [];
  if (scopedBlockType) {
    return scoped;
  }

  return BLOCK_SCHEMAS.map((schema) =>
    getFieldValueSuggestions(schema.blockType, fieldKey)
  ).find((values) => values.length > 0) ?? [];
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
