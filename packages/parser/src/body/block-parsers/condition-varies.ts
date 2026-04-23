import type { ConditionVariationDelta, ConditionVariesNode } from "@chemd/core";

import { parseKeyValueLines, pickFirstStringValue } from "../parse-body-shared";
import { parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const CONDITION_VARIES_META_FIELDS = new Set(["reaction", "standard", "notes"]);
const DELTA_SEPARATOR_PATTERN = /^(.*?)\s*(?:->|=>)\s*(.*?)$/;

const readString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value.join(" | ").trim() || undefined;
  }

  return value?.trim() || undefined;
};

const parseConditionDelta = (field: string, value: string): ConditionVariationDelta => {
  const matched = value.match(DELTA_SEPARATOR_PATTERN);
  if (!matched) {
    return { field, raw: value };
  }

  const baseline = matched[1].trim();
  const candidate = matched[2].trim();

  return {
    field,
    raw: value,
    ...(baseline ? { baseline } : {}),
    ...(candidate ? { candidate } : {})
  };
};

const buildChanges = (fields: Record<string, string | string[]>): ConditionVariationDelta[] =>
  Object.entries(fields).flatMap(([field, value]) => {
    if (CONDITION_VARIES_META_FIELDS.has(field)) {
      return [];
    }

    const raw = readString(value);
    return raw ? [parseConditionDelta(field, raw)] : [];
  });

export const parseConditionVariesBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  const fields = parseKeyValueLines(lines, diagnostics, {
    allowField: () => true,
    listFields: new Set(),
    blockTypeForDiagnostics: "condition-varies"
  });
  const fieldSpans = parseAllowedFieldSpans(lines, CONDITION_VARIES_META_FIELDS, {
    allowExtraField: () => true
  });

  return {
    type: "condition_varies",
    id,
    reaction: pickFirstStringValue(fields, ["reaction"]),
    standard: pickFirstStringValue(fields, ["standard"]),
    changes: buildChanges(fields),
    notes: pickFirstStringValue(fields, ["notes"]),
    fieldSpans
  } as ConditionVariesNode;
};
