import type {
  ConditionVariationAttempt,
  ConditionVariationAttemptMode,
  ConditionVariationDelta,
  ConditionVariationVariable,
  ConditionVariesNode
} from "@chemd/core";

import { parseKeyValueLines, pickFirstStringValue } from "../parse-body-shared";
import { parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const CONDITION_VARIES_META_FIELDS = new Set(["reaction", "standard", "condition", "varies", "notes"]);
const DELTA_SEPARATOR_PATTERN = /^(.*?)\s*(?:->|=>)\s*(.*?)$/;
const ATTEMPT_FIELD_PATTERN = /^var(\d+)$/;
const RESULT_FIELD_PATTERN = /^res(\d+)$/;
const NOTE_FIELD_PATTERN = /^note(\d+)$/;
const ATTEMPT_META_FIELDS = new Set(["id", "reaction", "ref", "result", "res", "note", "notes", "mode"]);

const readString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value.join(" | ").trim() || undefined;
  }

  return value?.trim() || undefined;
};

const splitSegments = (value: string): string[] =>
  value
    .split(/[|,]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

const splitAssignment = (segment: string): [string, string] | undefined => {
  const match = segment.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(.+)$/);
  return match ? [match[1], match[2].trim()] : undefined;
};

const parseAssignments = (value: string): { fields: Record<string, string>; bare: string[] } =>
  splitSegments(value).reduce(
    (result, segment) => {
      const assignment = splitAssignment(segment);
      if (!assignment) {
        return { ...result, bare: [...result.bare, segment] };
      }

      const [key, raw] = assignment;
      return { ...result, fields: { ...result.fields, [key]: raw } };
    },
    { fields: {} as Record<string, string>, bare: [] as string[] }
  );

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

const createAttemptDelta = (
  field: string,
  value: string,
  baseline: ConditionVariationVariable[]
): ConditionVariationDelta => {
  const parsed = parseConditionDelta(field, value);
  if (parsed.baseline || parsed.candidate) {
    return parsed;
  }

  const baselineValue = baseline.find((variable) => variable.field === field)?.baseline;
  return {
    ...parsed,
    ...(baselineValue ? { baseline: baselineValue } : {}),
    candidate: value
  };
};

const parseConditionVariable = (segment: string): ConditionVariationVariable => {
  const assignment = splitAssignment(segment);
  if (!assignment) {
    return { field: segment, raw: segment };
  }

  const [field, baseline] = assignment;
  return { field, raw: segment, baseline };
};

const parseConditionVariables = (value: string | undefined): ConditionVariationVariable[] | undefined => {
  const variables = value ? splitSegments(value).map(parseConditionVariable) : [];
  return variables.length > 0 ? variables : undefined;
};

const parseVaryFields = (value: string | undefined): string[] | undefined => {
  const fields = value ? splitSegments(value) : [];
  return fields.length > 0 ? fields : undefined;
};

const isAttemptAuxiliaryField = (field: string): boolean =>
  ATTEMPT_FIELD_PATTERN.test(field) || RESULT_FIELD_PATTERN.test(field) || NOTE_FIELD_PATTERN.test(field);

const buildChanges = (fields: Record<string, string | string[]>): ConditionVariationDelta[] =>
  Object.entries(fields).flatMap(([field, value]) => {
    if (CONDITION_VARIES_META_FIELDS.has(field) || isAttemptAuxiliaryField(field)) {
      return [];
    }

    const raw = readString(value);
    return raw ? [parseConditionDelta(field, raw)] : [];
  });

const readAttemptMode = (raw: string | undefined): ConditionVariationAttemptMode | undefined => {
  if (!raw) {
    return undefined;
  }

  return ["override", "full", "replace"].includes(raw.toLowerCase()) ? "override" : "partial";
};

const createAttemptCondition = (
  mode: ConditionVariationAttemptMode | undefined,
  baseline: ConditionVariationVariable[],
  changes: ConditionVariationDelta[]
): ConditionVariationDelta[] => {
  if (mode === "override") {
    return changes;
  }

  const changedFields = new Set(changes.map((change) => change.field));
  const inherited = baseline.flatMap((variable): ConditionVariationDelta[] =>
    changedFields.has(variable.field) || variable.baseline === undefined
      ? []
      : [{ field: variable.field, raw: variable.raw, baseline: variable.baseline, candidate: variable.baseline }]
  );

  return [...inherited, ...changes];
};

const readAttemptReaction = (parsed: ReturnType<typeof parseAssignments>): string | undefined =>
  parsed.fields.reaction ?? parsed.fields.ref ?? parsed.bare[0];

const readAttemptResult = (
  index: string,
  fields: Record<string, string | string[]>,
  parsed: ReturnType<typeof parseAssignments>
): string | undefined =>
  readString(fields[`res${index}`]) ?? parsed.fields.result ?? parsed.fields.res;

const readAttemptNote = (
  index: string,
  fields: Record<string, string | string[]>,
  parsed: ReturnType<typeof parseAssignments>
): string | undefined =>
  readString(fields[`note${index}`]) ?? parsed.fields.note ?? parsed.fields.notes;

const buildAttempt = (
  key: string,
  raw: string,
  fields: Record<string, string | string[]>,
  baseline: ConditionVariationVariable[]
): ConditionVariationAttempt => {
  const index = key.match(ATTEMPT_FIELD_PATTERN)?.[1] ?? "";
  const parsed = parseAssignments(raw);
  const mode = readAttemptMode(parsed.fields.mode);
  const changes = Object.entries(parsed.fields).flatMap(([field, value]) =>
    ATTEMPT_META_FIELDS.has(field) ? [] : [createAttemptDelta(field, value, baseline)]
  );
  const reaction = readAttemptReaction(parsed);
  const result = readAttemptResult(index, fields, parsed);
  const note = readAttemptNote(index, fields, parsed);

  return {
    id: parsed.fields.id ?? key,
    raw,
    ...(mode ? { mode } : {}),
    ...(reaction ? { reaction } : {}),
    ...(result ? { result } : {}),
    ...(note ? { note } : {}),
    changes,
    condition: createAttemptCondition(mode, baseline, changes)
  };
};

const buildAttempts = (
  fields: Record<string, string | string[]>,
  baseline: ConditionVariationVariable[] = []
): ConditionVariationAttempt[] | undefined => {
  const attempts = Object.entries(fields).flatMap(([field, value]) => {
    if (!ATTEMPT_FIELD_PATTERN.test(field)) {
      return [];
    }

    const raw = readString(value);
    return raw ? [buildAttempt(field, raw, fields, baseline)] : [];
  });

  return attempts.length > 0 ? attempts : undefined;
};

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
  const condition = parseConditionVariables(pickFirstStringValue(fields, ["condition"]));
  const attempts = buildAttempts(fields, condition);

  return {
    type: "condition_varies",
    id,
    reaction: pickFirstStringValue(fields, ["reaction"]),
    standard: pickFirstStringValue(fields, ["standard"]),
    condition,
    varyFields: parseVaryFields(pickFirstStringValue(fields, ["varies"])),
    changes: buildChanges(fields),
    attempts,
    notes: pickFirstStringValue(fields, ["notes"]),
    fieldSpans
  } as ConditionVariesNode;
};
