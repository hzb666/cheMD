import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, StepFamily } from "@chemd/step-ontology";

import { parseQuantity } from "./normalize";
import type { QuantityClass, QuantityType } from "./types";

interface NormalizedParams {
  params: Record<string, unknown>;
  quantities: QuantityType[];
  diagnostics: V03Diagnostic[];
}

const STEP_FAMILIES = new Set<StepFamily>([
  "charge",
  "add",
  "transfer",
  "mix",
  "cool",
  "heat",
  "hold",
  "purge",
  "quench",
  "extract",
  "wash",
  "separate_layers",
  "filter",
  "dry",
  "concentrate",
  "purify",
  "sample",
  "analyze",
  "observe",
  "store"
]);

const STEP_QUANTITY_FIELDS: Record<string, QuantityClass> = {
  amount: "amount",
  mass: "mass",
  volume: "volume",
  temperature: "temperature",
  target_temperature: "temperature",
  duration: "time",
  time: "time",
  pressure: "pressure",
  concentration: "concentration",
  equivalent: "equivalent",
  equivalents: "equivalent",
  percent: "percent"
};

const REQUIRED_PARAM_HINTS: Partial<Record<StepFamily, { keys: string[]; expected: string }>> = {
  heat: { keys: ["temperature", "target_temperature", "duration"], expected: "temperature or duration" },
  cool: { keys: ["temperature", "target_temperature", "method"], expected: "temperature or method" },
  analyze: { keys: ["analysisType", "analysis_type", "type"], expected: "analysisType" },
  extract: { keys: ["solvent"], expected: "solvent" }
};

const ALLOWED_PARAM_HINTS: Partial<Record<StepFamily, string[]>> = {
  filter: ["medium", "wash"]
};

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
  params: Record<string, string> | undefined
): NormalizedParams => {
  const normalized: Record<string, unknown> = {};
  const quantities: QuantityType[] = [];
  const diagnostics: V03Diagnostic[] = [];

  for (const [field, raw] of Object.entries(params ?? {})) {
    const quantityClass = STEP_QUANTITY_FIELDS[field];
    if (!quantityClass) {
      normalized[field] = raw;
      continue;
    }

    const parsed = parseQuantity(raw, quantityClass, {
      sourceNodeType: "step",
      sourceNodeId: stepId,
      field
    });
    normalized[field] = parsed.quantity ?? raw;
    if (parsed.quantity) {
      quantities.push(parsed.quantity);
    }
    if (parsed.diagnostic) {
      diagnostics.push(parsed.diagnostic);
    }
  }

  return { params: normalized, quantities, diagnostics };
};

export const applyStepDefaults = (
  family: StepFamily,
  params: Record<string, unknown>
): Record<string, unknown> =>
  family === "purge" && params.atmosphere === undefined
    ? { ...params, atmosphere: "nitrogen" }
    : params;

const hasAnyParam = (params: Record<string, unknown>, keys: string[]): boolean =>
  keys.some((key) => {
    const value = params[key];
    return value !== undefined && value !== null && value !== "";
  });

export const validateRequiredParams = (
  stepId: string,
  family: StepFamily,
  params: Record<string, unknown>
): V03Diagnostic[] => {
  const hint = REQUIRED_PARAM_HINTS[family];
  if (!hint || hasAnyParam(params, hint.keys)) {
    return [];
  }

  return [
    createStepDiagnostic(
      "E_STEP_PARAM_MISSING",
      `Step ${stepId} (${family}) requires ${hint.expected}`,
      stepId,
      { step_family: family, expected: hint.expected }
    )
  ];
};

export const validateAllowedParams = (
  stepId: string,
  family: StepFamily,
  params: Record<string, unknown>
): V03Diagnostic[] => {
  const allowedParams = ALLOWED_PARAM_HINTS[family];
  if (!allowedParams) {
    return [];
  }

  const invalidParams = Object.keys(params).filter((key) => !allowedParams.includes(key));
  return invalidParams.map((param) =>
    createStepDiagnostic(
      "E_STEP_PARAM_INVALID",
      `Step ${stepId} (${family}) does not allow parameter: ${param}`,
      stepId,
      { step_family: family, param, allowed_params: allowedParams }
    )
  );
};

export const validateStepIds = (steps: CanonicalStepNode[]): V03Diagnostic[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const step of steps) {
    if (seen.has(step.stepId)) {
      duplicates.add(step.stepId);
    }
    seen.add(step.stepId);
  }

  return [...duplicates].map((stepId) =>
    createStepDiagnostic(
      "E_STEP_ID_DUPLICATE",
      `Duplicate procedure step id: ${stepId}`,
      stepId,
      { step_id: stepId }
    )
  );
};

export const validateDependencyRefs = (steps: CanonicalStepNode[]): V03Diagnostic[] => {
  const knownIds = new Set(steps.map((step) => step.stepId));

  return steps.flatMap((step) =>
    (step.dependsOn ?? [])
      .filter((dependencyId) => !knownIds.has(dependencyId))
      .map((dependencyId) =>
        createStepDiagnostic(
          "E_STEP_INVALID_REFERENCE",
          `Step ${step.stepId} depends on missing step: ${dependencyId}`,
          step.stepId,
          { dependency_id: dependencyId }
        )
      )
  );
};

const collectCycleIds = (steps: CanonicalStepNode[]): string[] => {
  const graph = new Map(steps.map((step) => [step.stepId, step.dependsOn ?? []]));
  const visited = new Set<string>();
  const active = new Set<string>();
  const cyclic = new Set<string>();

  const visit = (stepId: string) => {
    if (active.has(stepId)) {
      cyclic.add(stepId);
      return;
    }
    if (visited.has(stepId)) {
      return;
    }
    visited.add(stepId);
    active.add(stepId);
    for (const dependencyId of graph.get(stepId) ?? []) {
      if (graph.has(dependencyId)) {
        visit(dependencyId);
      }
    }
    active.delete(stepId);
  };

  for (const stepId of graph.keys()) {
    visit(stepId);
  }
  return [...cyclic];
};

export const validateDependencyCycles = (steps: CanonicalStepNode[]): V03Diagnostic[] =>
  collectCycleIds(steps).map((stepId) =>
    createStepDiagnostic(
      "E_STEP_DEPENDENCY_CYCLE",
      `Step dependency cycle includes step: ${stepId}`,
      stepId,
      { step_id: stepId }
    )
  );
