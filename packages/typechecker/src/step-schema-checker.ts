import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import {
  getStepFamilySchema,
  getStepParamSchema,
  STEP_FAMILIES,
  type StepFamily,
  type StepParamSchema,
  type StepRequirement
} from "@chemd/step-ontology";

import { parseQuantity } from "./normalize";
import type { QuantityType } from "./types";

interface NormalizedParams {
  params: Record<string, unknown>;
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

interface StepRequirementContext {
  inputs?: unknown[];
  outputs?: unknown[];
  params: Record<string, unknown>;
}

export const isStepFamily = (family: string): family is StepFamily =>
  STEP_FAMILIES.has(family as StepFamily);

export const createStepDiagnostic = (
  code: string,
  message: string,
  stepId: string,
  facts: Record<string, unknown>
): V03Diagnostic =>
  createV03Diagnostic({
    code,
    severity: "error",
    message,
    sourceLayer: "typechecker",
    sourceNodeType: "step",
    sourceNodeId: stepId,
    ...(typeof facts.field === "string" ? { sourceField: facts.field } : {}),
    facts
  });

export const normalizeStepParams = (
  stepId: string,
  family: StepFamily,
  params: Record<string, string> | undefined
): NormalizedParams => {
  const normalized: Record<string, unknown> = {};
  const quantities: QuantityType[] = [];
  const diagnostics: V03Diagnostic[] = [];

  for (const [field, raw] of Object.entries(params ?? {})) {
    const schema = getStepParamSchema(family, field);
    const canonicalField = schema?.name ?? field;
    if (normalized[canonicalField] !== undefined) {
      diagnostics.push(createStepDiagnostic(
        "E_STEP_PARAM_INVALID",
        `Step ${stepId} (${family}) defines duplicate parameter: ${canonicalField}`,
        stepId,
        { step_family: family, field: canonicalField }
      ));
      continue;
    }

    const parsed = normalizeStepParamValue(stepId, canonicalField, raw, schema);
    normalized[canonicalField] = parsed.value;
    quantities.push(...parsed.quantities);
    diagnostics.push(...parsed.diagnostics);
  }

  return { params: normalized, quantities, diagnostics };
};

export const applyStepDefaults = (
  family: StepFamily,
  params: Record<string, unknown>
): Record<string, unknown> => {
  const defaults = getStepFamilySchema(family).defaults ?? [];
  return defaults.reduce<Record<string, unknown>>(
    (next, item) => next[item.field] === undefined ? { ...next, [item.field]: item.value } : next,
    params
  );
};

export const validateAllowedParams = (
  stepId: string,
  family: StepFamily,
  params: Record<string, unknown>
): V03Diagnostic[] => {
  const schema = getStepFamilySchema(family);
  if (schema.unknownParams !== "error") {
    return [];
  }

  const allowedParams = new Set(schema.params.map((param) => param.name));
  return Object.keys(params)
    .filter((key) => !allowedParams.has(key))
    .map((param) =>
      createStepDiagnostic(
        "E_STEP_PARAM_INVALID",
        `Step ${stepId} (${family}) does not allow parameter: ${param}`,
        stepId,
        { step_family: family, param, allowed_params: [...allowedParams] }
      )
    );
};

export const validateRequiredParams = (
  stepId: string,
  family: StepFamily,
  context: StepRequirementContext
): V03Diagnostic[] =>
  getStepFamilySchema(family).required.flatMap((requirement) =>
    isRequirementSatisfied(requirement, context)
      ? []
      : [createStepDiagnostic(
          "E_STEP_PARAM_MISSING",
          `Step ${stepId} (${family}) requires ${formatRequirement(requirement)}`,
          stepId,
          { step_family: family, expected: formatRequirement(requirement) }
        )]
  );

const normalizeStepParamValue = (
  stepId: string,
  field: string,
  raw: string,
  schema: StepParamSchema | undefined
): { value: unknown; quantities: QuantityType[]; diagnostics: V03Diagnostic[] } => {
  if (schema?.type === "quantity" && schema.quantityClass) {
    const parsed = parseQuantity(raw, schema.quantityClass, {
      sourceNodeType: "step",
      sourceNodeId: stepId,
      field
    });
    const diagnostics = [
      ...(parsed.diagnostics ?? (parsed.diagnostic ? [parsed.diagnostic] : [])),
      ...(parsed.quantity ? [] : [createTypeMismatchDiagnostic(stepId, field, raw, "quantity")])
    ];
    return {
      value: parsed.quantity ?? raw,
      quantities: parsed.quantity ? [parsed.quantity] : [],
      diagnostics
    };
  }

  if (schema?.type === "enum") {
    const value = raw.trim().toLowerCase();
    return schema.values?.includes(value)
      ? { value, quantities: [], diagnostics: [] }
      : {
          value: raw,
          quantities: [],
          diagnostics: [createTypeMismatchDiagnostic(stepId, field, raw, `one of ${schema.values?.join(", ")}`)]
        };
  }

  if (schema?.type === "boolean") {
    const normalized = raw.trim().toLowerCase();
    if (["true", "false"].includes(normalized)) {
      return { value: normalized === "true", quantities: [], diagnostics: [] };
    }
    return {
      value: raw,
      quantities: [],
      diagnostics: [createTypeMismatchDiagnostic(stepId, field, raw, "boolean")]
    };
  }

  return { value: raw, quantities: [], diagnostics: [] };
};

const createTypeMismatchDiagnostic = (
  stepId: string,
  field: string,
  raw: string,
  expected: string
): V03Diagnostic =>
  createStepDiagnostic(
    "E_STEP_PARAM_TYPE_MISMATCH",
    `Step ${stepId} parameter ${field} must be ${expected}`,
    stepId,
    { field, raw_value: raw, expected }
  );

const hasAnyValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== undefined && value !== null && value !== "";
};

const readRequirementField = (field: string, context: StepRequirementContext): unknown =>
  field === "inputs"
    ? context.inputs
    : field === "outputs"
      ? context.outputs
      : context.params[field];

const hasField = (field: string, context: StepRequirementContext): boolean =>
  hasAnyValue(readRequirementField(field, context));

const isRequirementSatisfied = (
  requirement: StepRequirement,
  context: StepRequirementContext
): boolean => {
  if (requirement.kind === "field") {
    return hasField(requirement.field, context);
  }

  const matches = requirement.fields.filter((field) => hasField(field, context)).length;
  return requirement.kind === "anyOf" ? matches > 0 : matches === 1;
};

const formatRequirement = (requirement: StepRequirement): string => {
  if (requirement.kind === "field") {
    return requirement.field;
  }

  return `${requirement.kind}(${requirement.fields.join(", ")})`;
};
