import {
  getBlockChildLineFields,
  getCompletionBlockFieldSchemas,
  type BlockFieldSchema
} from "@chemd/core";
import {
  STEP_FAMILIES,
  getStepFamilySchema,
  type StepFamily
} from "@chemd/step-ontology";

import type {
  ChemdCompletionBlockKind,
  ChemdCompletionContext,
  ChemdCompletionItem
} from "./completion-types";

const commonFields = ["kind", "name", "caption"];

interface FieldCompletionEntry {
  aliasOf?: string;
  name: string;
  schema?: BlockFieldSchema;
}

interface StepParamCompletionEntry {
  aliasOf?: string;
  detail: string;
  name: string;
}

export const getChemdFieldCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  if (context.stepParam) {
    return getStepParamCompletions(context);
  }

  const block = context.block;
  if (!block || !context.isFieldKeyPosition) {
    return [];
  }

  return getFieldsForKind(block.kind, context.fieldPrefix)
    .filter((entry) => !block.fields.has(entry.aliasOf ?? entry.name))
    .filter((entry) => entry.name.startsWith(context.fieldPrefix))
    .map((entry, index) => ({
      id: `field.chemd.${block.kind}.${entry.name}`,
      label: `${entry.name}:`,
      kind: "field",
      insertText: `${entry.name}: `,
      insertTextFormat: "plain",
      detail: entry.aliasOf ? `alias of ${entry.aliasOf}` : `${block.kind} field`,
      sortText: `${entry.aliasOf ? "1" : "0"}-${String(index).padStart(2, "0")}-${entry.name}`,
      filterText: entry.name,
      data: {
        type: "field",
        canonicalName: entry.aliasOf ?? entry.name,
        ...(entry.aliasOf ? { aliasOf: entry.aliasOf } : {})
      },
      range: {
        ...context.range,
        startColumn: Math.max(1, context.position.column - context.fieldPrefix.length)
      }
    }));
};

const getFieldsForKind = (
  kind: ChemdCompletionBlockKind,
  prefix: string
): FieldCompletionEntry[] => {
  if (kind === "unknown") {
    return commonFields.map((name) => ({ name }));
  }

  const { blockType, semanticKind } = getSchemaContext(kind);
  const fields = getCompletionBlockFieldSchemas(blockType, semanticKind);
  const canonicalEntries = fields.map((schema) => ({ name: schema.name, schema }));
  const aliasEntries = prefix.length === 0
    ? []
    : fields.flatMap((schema) =>
        schema.aliases?.map((alias) => ({ name: alias, aliasOf: schema.name, schema })) ?? []
      );
  const childEntries = getBlockChildLineFields(blockType).map((name) => ({ name }));

  return [...canonicalEntries, ...childEntries, ...aliasEntries];
};

const getSchemaContext = (
  kind: Exclude<ChemdCompletionBlockKind, "unknown">
): { blockType: string; semanticKind?: "molecule" | "reaction" } => {
  if (kind === "molecule" || kind === "reaction") {
    return { blockType: "chemd", semanticKind: kind };
  }

  return {
    blockType: kind === "condition_varies" ? "condition-varies" : kind
  };
};

const getStepParamCompletions = (
  context: ChemdCompletionContext
): ChemdCompletionItem[] => {
  const stepParam = context.stepParam;
  if (!stepParam || !STEP_FAMILIES.has(stepParam.family as StepFamily)) {
    return [];
  }

  const schema = getStepFamilySchema(stepParam.family as StepFamily);
  const prefix = stepParam.prefix;
  const canonicalEntries: StepParamCompletionEntry[] = schema.params.map((param) => ({
    name: param.name,
    detail: `${schema.family} parameter`
  }));
  const aliasEntries: StepParamCompletionEntry[] = prefix.length === 0
    ? []
    : schema.params.flatMap((param) =>
        param.aliases?.map((alias) => ({
          name: alias,
          aliasOf: param.name,
          detail: `alias of ${param.name}`
        })) ?? []
      );

  return [...canonicalEntries, ...aliasEntries]
    .filter((entry) => !stepParam.usedParams.has(entry.aliasOf ?? entry.name))
    .filter((entry) => entry.name.startsWith(prefix))
    .map((entry, index) => ({
      id: `field.step.${schema.family}.${entry.name}`,
      label: `${entry.name}=`,
      kind: "field",
      insertText: `${entry.name}=`,
      insertTextFormat: "plain",
      detail: entry.detail,
      sortText: `${entry.aliasOf ? "1" : "0"}-${String(index).padStart(2, "0")}-${entry.name}`,
      filterText: entry.name,
      data: {
        type: "field",
        canonicalName: entry.aliasOf ?? entry.name,
        ...(entry.aliasOf ? { aliasOf: entry.aliasOf } : {})
      },
      range: {
        ...context.range,
        startColumn: Math.max(1, context.position.column - prefix.length)
      }
    }));
};
