import {
  type ConditionVariationAttempt,
  type ConditionVariationAttemptMode,
  type ConditionVariationDelta,
  type ConditionVariationVariable,
  type ConditionVariesNode
} from "@chemd/core";

import { parseKeyValueLine } from "../parse-body-shared";
import { parseAllowedFieldSpans, readStructuredBlockId } from "./common";
import type { BlockParser } from "./types";

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
const CONDITION_VARIES_FIELD_SPANS = new Set([
  "reaction",
  "standard",
  "factor",
  "outcome",
  "attempt",
  "result",
  "note",
  "notes"
]);

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
  meta: { reaction?: string; result?: string; note?: string; mode?: ConditionVariationAttemptMode }
): ConditionVariationAttempt => ({
  id,
  raw: header,
  ...(meta.mode ? { mode: meta.mode } : {}),
  ...(meta.reaction ? { reaction: meta.reaction } : {}),
  ...(meta.result ? { result: meta.result } : {}),
  ...(meta.note ? { note: meta.note } : {}),
  factors: values,
  outcomes,
  changes: buildChangesFromFactors(factors, values),
  condition: createAttemptCondition(meta.mode, factors, buildChangesFromFactors(factors, values))
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
    | { id: string; header: string; factors: Record<string, string>; outcomes: Record<string, string>; meta: { reaction?: string; result?: string; note?: string; mode?: ConditionVariationAttemptMode } }
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
      const mode = readAttemptMode(assignments.fields.mode);
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
          ...(mode ? { mode } : {}),
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
    fieldSpans: parseAllowedFieldSpans(lines, CONDITION_VARIES_FIELD_SPANS)
  };
};

export const parseConditionVariesBlock: BlockParser = ({ headerArg, lines, diagnostics }) => {
  const id = readStructuredBlockId(headerArg, diagnostics);
  return parseConditionDslBlock(id, lines, diagnostics);
};
