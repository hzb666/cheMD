import {
  getAllowedBlockFieldSet,
  type ConditionVariationAttempt,
  type ConditionVariationAttemptMode,
  type ConditionVariationDelta,
  type ConditionVariationVariable,
  type ConditionVariesNode
} from "@chemd/core";

import { parseKeyValueLine, parseKeyValueLines, pickFirstStringValue } from "../parse-body-shared";
import { parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

const CONDITION_VARIES_META_FIELDS = getAllowedBlockFieldSet("condition-varies");
const DELTA_SEPARATOR_PATTERN = /^(.*?)\s*(?:->|=>)\s*(.*?)$/;
const ATTEMPT_FIELD_PATTERN = /^var(\d+)$/;
const RESULT_FIELD_PATTERN = /^res(\d+)$/;
const NOTE_FIELD_PATTERN = /^note(\d+)$/;
const ATTEMPT_META_FIELDS = new Set(["id", "reaction", "ref", "result", "res", "note", "notes", "mode"]);
const RESERVED_CONDITION_DSL_FIELDS = new Set([
  "reaction",
  "standard",
  "condition",
  "varies",
  "factor",
  "outcome",
  "attempt",
  "result",
  "note",
  "notes"
]);

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

const hasSectionDslSyntax = (lines: string[]): boolean =>
  lines.some((line) => {
    const parsed = parseKeyValueLine(line.trim());
    return parsed ? ["factor", "outcome", "attempt"].includes(parsed.key) : false;
  });

const createConditionDiagnostic = (
  diagnostics: Parameters<BlockParser>[0]["diagnostics"],
  id: string | undefined,
  code: string,
  message: string,
  field: string,
  facts: Record<string, unknown> = {}
) => {
  diagnostics.push({
    code,
    severity: "error",
    message,
    nodeId: id,
    sourceLayer: "parser",
    sourceNodeType: "condition_varies",
    sourceNodeId: id,
    sourceField: field,
    facts
  });
};

const parseDeclaration = (raw: string): ConditionVariationVariable => {
  const [fieldSegment, ...segments] = splitSegments(raw);
  const assignments = parseAssignments(segments.join("|"));
  return {
    field: fieldSegment ?? "",
    raw,
    ...(assignments.fields.baseline ? { baseline: assignments.fields.baseline } : {}),
    ...(assignments.fields.quantity ? { quantityClass: assignments.fields.quantity } : {}),
    ...(assignments.fields.quantityClass ? { quantityClass: assignments.fields.quantityClass } : {})
  };
};

const declarationByField = (items: ConditionVariationVariable[] | undefined): Map<string, ConditionVariationVariable> =>
  new Map((items ?? []).map((item) => [item.field, item]));

const buildConditionFromFactors = (
  factors: ConditionVariationVariable[],
  values: Record<string, string>
): ConditionVariationDelta[] =>
  factors.flatMap((factor) => {
    const candidate = values[factor.field] ?? factor.baseline;
    return candidate === undefined
      ? []
      : [{
          field: factor.field,
          raw: candidate,
          ...(factor.baseline ? { baseline: factor.baseline } : {}),
          candidate
        }];
  });

const buildChangesFromFactors = (
  factors: ConditionVariationVariable[],
  values: Record<string, string>
): ConditionVariationDelta[] =>
  Object.entries(values).map(([field, candidate]) => {
    const baseline = factors.find((item) => item.field === field)?.baseline;
    return {
      field,
      raw: candidate,
      ...(baseline ? { baseline } : {}),
      candidate
    };
  });

const createAttemptFromSection = (
  id: string,
  header: string,
  factors: ConditionVariationVariable[],
  values: Record<string, string>,
  outcomes: Record<string, string>,
  meta: { reaction?: string; result?: string; note?: string }
): ConditionVariationAttempt => ({
  id,
  raw: header,
  ...(meta.reaction ? { reaction: meta.reaction } : {}),
  ...(meta.result ? { result: meta.result } : {}),
  ...(meta.note ? { note: meta.note } : {}),
  factors: values,
  outcomes,
  changes: buildChangesFromFactors(factors, values),
  condition: buildConditionFromFactors(factors, values)
});

const parseConditionDslBlock = (
  id: string | undefined,
  lines: string[],
  diagnostics: Parameters<BlockParser>[0]["diagnostics"]
): ConditionVariesNode => {
  const factors: ConditionVariationVariable[] = [];
  const outcomes: ConditionVariationVariable[] = [];
  const attempts: ConditionVariationAttempt[] = [];
  let standard: string | undefined;
  let reaction: string | undefined;
  let notes: string | undefined;
  let current:
    | { id: string; header: string; factors: Record<string, string>; outcomes: Record<string, string>; meta: { reaction?: string; result?: string; note?: string } }
    | undefined;

  const finishAttempt = () => {
    if (!current) {
      return;
    }

    attempts.push(createAttemptFromSection(
      current.id,
      current.header,
      factors,
      current.factors,
      current.outcomes,
      current.meta
    ));
    current = undefined;
  };

  const seenAttempts = new Set<string>();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed === "none") {
      createConditionDiagnostic(diagnostics, id, "E_CONDITION_DSL_FIELD", "`none` is only valid inside analysis TLC lanes.", "none");
      return;
    }

    const parsed = parseKeyValueLine(trimmed);
    if (!parsed) {
      return;
    }

    const { key, rawValue } = parsed;
    if (key === "attempt") {
      finishAttempt();
      const [attemptId, ...segments] = splitSegments(rawValue);
      const assignments = parseAssignments(segments.join("|"));
      if (!attemptId) {
        createConditionDiagnostic(diagnostics, id, "E_CONDITION_ATTEMPT_ID", "attempt requires an id.", "attempt");
        return;
      }
      if (seenAttempts.has(attemptId)) {
        createConditionDiagnostic(diagnostics, id, "E_CONDITION_ATTEMPT_ID", `Duplicate attempt id: ${attemptId}`, "attempt", { attempt_id: attemptId });
      }
      seenAttempts.add(attemptId);
      current = {
        id: attemptId,
        header: rawValue,
        factors: {},
        outcomes: {},
        meta: {
          ...(assignments.fields.reaction ? { reaction: assignments.fields.reaction } : {}),
          ...(assignments.fields.result ? { result: assignments.fields.result } : {})
        }
      };
      return;
    }

    if (current && ["factor", "outcome", "standard"].includes(key)) {
      createConditionDiagnostic(
        diagnostics,
        id,
        "E_CONDITION_DSL_ORDER",
        `${key} must be declared before the first attempt.`,
        key,
        { line: index + 1 }
      );
      return;
    }

    if (!current) {
      if (key === "standard") {
        standard = rawValue;
        return;
      }
      if (key === "reaction") {
        reaction = rawValue;
        return;
      }
      if (key === "notes") {
        notes = rawValue;
        return;
      }
      if (key === "factor" || key === "outcome") {
        const declaration = parseDeclaration(rawValue);
        const peer = key === "factor" ? outcomes : factors;
        const target = key === "factor" ? factors : outcomes;
        if (RESERVED_CONDITION_DSL_FIELDS.has(declaration.field) || peer.some((item) => item.field === declaration.field) || target.some((item) => item.field === declaration.field)) {
          createConditionDiagnostic(
            diagnostics,
            id,
            "E_CONDITION_DSL_DECLARATION",
            `Invalid or duplicate ${key} field: ${declaration.field}`,
            key,
            { field: declaration.field }
          );
        }
        target.push(declaration);
        return;
      }
      createConditionDiagnostic(diagnostics, id, "E_CONDITION_DSL_FIELD", `Unknown condition-varies field before attempts: ${key}`, key);
      return;
    }

    if (["note", "notes"].includes(key)) {
      current.meta.note = rawValue;
      return;
    }
    if (key === "result") {
      current.meta.result = rawValue;
      return;
    }
    if (key === "reaction") {
      current.meta.reaction = rawValue;
      return;
    }

    const factorMap = declarationByField(factors);
    const outcomeMap = declarationByField(outcomes);
    if (factorMap.has(key)) {
      if (current.factors[key] !== undefined) {
        createConditionDiagnostic(diagnostics, id, "E_CONDITION_ATTEMPT_DUPLICATE_FIELD", `Duplicate attempt factor: ${key}`, key);
      }
      current.factors[key] = rawValue;
      return;
    }
    if (outcomeMap.has(key)) {
      if (current.outcomes[key] !== undefined) {
        createConditionDiagnostic(diagnostics, id, "E_CONDITION_ATTEMPT_DUPLICATE_FIELD", `Duplicate attempt outcome: ${key}`, key);
      }
      current.outcomes[key] = rawValue;
      return;
    }

    createConditionDiagnostic(diagnostics, id, "E_CONDITION_ATTEMPT_UNKNOWN_FIELD", `Attempt field is not declared as factor or outcome: ${key}`, key);
  });

  finishAttempt();

  for (const attempt of attempts) {
    for (const outcome of outcomes) {
      if (!attempt.outcomes || attempt.outcomes[outcome.field] === undefined) {
        createConditionDiagnostic(
          diagnostics,
          id,
          "E_CONDITION_OUTCOME_MISSING",
          `Attempt ${attempt.id} is missing outcome ${outcome.field}.`,
          outcome.field,
          { attempt_id: attempt.id, outcome: outcome.field }
        );
      }
    }
  }

  return {
    type: "condition_varies",
    id,
    reaction,
    standard,
    factors,
    outcomes,
    condition: factors,
    varyFields: factors.map((factor) => factor.field),
    changes: factors.map((factor) => ({
      field: factor.field,
      raw: factor.raw,
      ...(factor.baseline ? { baseline: factor.baseline } : {})
    })),
    attempts: attempts.length > 0 ? attempts : undefined,
    notes,
    fieldSpans: parseAllowedFieldSpans(lines, CONDITION_VARIES_META_FIELDS, "condition-varies", {
      allowExtraField: () => true
    })
  };
};

export const parseConditionVariesBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  if (hasSectionDslSyntax(lines)) {
    return parseConditionDslBlock(id, lines, diagnostics);
  }

  const fields = parseKeyValueLines(lines, diagnostics, {
    allowField: () => true,
    listFields: new Set(),
    blockTypeForDiagnostics: "condition-varies"
  });
  const fieldSpans = parseAllowedFieldSpans(lines, CONDITION_VARIES_META_FIELDS, "condition-varies", {
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
