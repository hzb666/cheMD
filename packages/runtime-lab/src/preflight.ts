import {
  isRobotRunnableStep,
  STEP_FAMILIES,
  type CanonicalProcedureControlNode,
  type StepFamily
} from "@chemd/step-ontology";

import type {
  RuntimeContext,
  RuntimeStep,
  RunPlan
} from "./index";
import { createPreflightDiagnostic, type PreflightIssue, type PreflightResult } from "./runtime-errors";

const createUnknownRobotStepIssue = (step: RuntimeStep): PreflightIssue => ({
    code: "E_RUNTIME_UNKNOWN_STEP",
    severity: "error",
    message: `Step family cannot enter robot-run without adapter support: ${step.family}`,
    kind: "adapter",
    stepId: step.stepId,
    facts: {
      step_id: step.stepId,
      step_family: step.family,
      mode: "robot-run"
    },
    requiredAction: "provide_adapter"
  });

const isKnownStepFamily = (family: StepFamily): boolean =>
  STEP_FAMILIES.has(family);

export const preflightRun = (plan: RunPlan, context: RuntimeContext): PreflightResult => {
  const available = new Set(context.capabilities);
  const capabilityIssues = plan.steps.flatMap((step): PreflightIssue[] =>
    step.requiredCapabilities
      .filter((capability) => !available.has(capability))
      .map((capability) => ({
        severity: "error",
        code: "E_RUNTIME_CAPABILITY_MISSING",
        kind: "capability",
        stepId: step.stepId,
        message: `Step ${step.stepId} requires missing capability: ${capability}`,
        facts: {
          step_id: step.stepId,
          missing_capability: capability,
          mode: context.mode ?? "dry-run"
        },
        requiredAction: "change_context"
      }))
  );
  const robotIssues = context.mode === "robot-run"
    ? plan.steps
        .filter((step) => !isKnownStepFamily(step.family) || !isRobotRunnableStep(step.family))
        .map((step) => createUnknownRobotStepIssue(step))
    : [];
  const issues = [
    ...capabilityIssues,
    ...robotIssues,
    ...collectDeviceRangeIssues(plan, context),
    ...collectInventoryIssues(plan, context),
    ...collectSafetyIssues(plan, context),
    ...collectControlIssues(plan, context)
  ];
  const diagnostics = [
    ...issues.map(createPreflightDiagnostic)
  ];

  return {
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    issues,
    diagnostics
  };
};

const readNumericParam = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object" && "canonicalValue" in value && typeof value.canonicalValue === "number") {
    return value.canonicalValue;
  }
  if (value && typeof value === "object" && "value" in value && typeof value.value === "number") {
    return value.value;
  }
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : undefined;
  }
  return undefined;
};

const collectDeviceRangeIssues = (
  plan: RunPlan,
  context: RuntimeContext
): PreflightIssue[] =>
  plan.steps.flatMap((step) =>
    step.requiredCapabilities.flatMap((capability) => {
      const device = context.devices?.find((item) => item.capability === capability);
      const candidate = readDeviceCandidate(step.params, capability);
      if (!device || candidate === undefined) {
        return [];
      }
      if ((device.min !== undefined && candidate < device.min) || (device.max !== undefined && candidate > device.max)) {
        return [{
          severity: "error" as const,
          code: "E_RUNTIME_DEVICE_RANGE" as const,
          kind: "device_range" as const,
          stepId: step.stepId,
          message: `Step ${step.stepId} is outside ${capability} device range.`,
          facts: {
            step_id: step.stepId,
            capability,
            candidate,
            min: device.min,
            max: device.max,
            unit: device.unit
          },
          requiredAction: "change_context" as const
        }];
      }
      return [];
    })
  );

const readDeviceCandidate = (
  params: RuntimeStep["params"],
  capability: RuntimeStep["requiredCapabilities"][number]
): number | undefined => {
  for (const key of deviceParamKeys(capability)) {
    const candidate = readNumericParam(params[key]);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
};

const deviceParamKeys = (
  capability: RuntimeStep["requiredCapabilities"][number]
): string[] => {
  if (capability === "heating" || capability === "cooling") {
    return ["temperature", "target_temperature", "targetTemperature"];
  }
  if (capability === "vacuum") {
    return ["pressure", "target_pressure", "targetPressure"];
  }
  if (capability === "stirring") {
    return ["rpm", "rate", "stir_rate", "stirRate"];
  }
  return ["temperature", "target_temperature", "pressure", "rpm", "rate"];
};

const normalizeMaterialId = (value: string): string =>
  value.trim().replace(/^@/, "");

const unique = (values: string[]): string[] => Array.from(new Set(values));

const readReferenceTokens = (value: unknown): string[] => {
  if (typeof value !== "string") {
    return [];
  }

  const explicitRefs = Array.from(value.matchAll(/@([A-Za-z0-9_.:-]+)/g), (match) => match[1] ?? "");
  if (explicitRefs.length > 0) {
    return explicitRefs;
  }

  return value
    .split(/[,;]/)
    .map((token) => token.trim())
    .filter(Boolean);
};

const collectMaterialIdsForStep = (step: RuntimeStep): string[] =>
  unique([
    ...(step.inputs ?? []).map((input) => normalizeMaterialId(input.raw)),
    ...readReferenceTokens(step.params.materials),
    ...readReferenceTokens(step.params.inputs)
  ].map(normalizeMaterialId));

const collectInventoryIssues = (
  plan: RunPlan,
  context: RuntimeContext
): PreflightIssue[] => {
  if (!context.inventory) {
    return [];
  }

  const inventory = new Map(context.inventory.materials.map((material) => [material.id, material]));
  return plan.steps.flatMap((step) =>
    (step.inputs ?? []).flatMap((input): PreflightIssue[] => {
      const materialId = normalizeMaterialId(input.raw);
      const material = inventory.get(materialId);
      if (!material || !material.available) {
        return [{
          severity: "error" as const,
          code: "E_RUNTIME_INVENTORY_UNAVAILABLE" as const,
          kind: "inventory" as const,
          stepId: step.stepId,
          message: `Step ${step.stepId} requires unavailable inventory: ${materialId}`,
          facts: { step_id: step.stepId, material_id: materialId },
          requiredAction: "change_context" as const
        }];
      }
      if (material.expired) {
        return [{
          severity: "warning" as const,
          code: "E_RUNTIME_INVENTORY_EXPIRED" as const,
          kind: "inventory" as const,
          stepId: step.stepId,
          message: `Step ${step.stepId} uses expired inventory: ${materialId}`,
          facts: { step_id: step.stepId, material_id: materialId },
          requiredAction: "change_context" as const
        }];
      }
      return [];
    })
  );
};

const collectSafetyIssues = (
  plan: RunPlan,
  context: RuntimeContext
): PreflightIssue[] =>
  plan.steps.flatMap((step) => {
    const inventory = new Map((context.inventory?.materials ?? []).map((material) => [material.id, material]));
    const materialIds = collectMaterialIdsForStep(step);
    const stepHazards = new Set(materialIds.flatMap((materialId) => inventory.get(materialId)?.hazards ?? []));
    const confirmationIssue: PreflightIssue[] = step.requiresConfirmation
      ? [{
          severity: context.mode === "robot-run" ? "error" : "warning",
          code: "E_RUNTIME_SAFETY_CONFIRMATION",
          kind: "safety",
          stepId: step.stepId,
          message: `Step ${step.stepId} requires manual confirmation.`,
          facts: { step_id: step.stepId, mode: context.mode ?? "dry-run" },
          requiredAction: "manual_confirmation"
        }]
      : [];
    const tagIssues = step.safetyTags.map((tag): PreflightIssue => ({
      severity: context.mode === "robot-run" && ["hazardous_reagent", "quench", "exotherm"].includes(tag)
        ? "error"
        : "warning",
      code: "E_RUNTIME_SAFETY_TAG",
      kind: "safety",
      stepId: step.stepId,
      message: `Step ${step.stepId} has safety tag: ${tag}`,
      facts: { step_id: step.stepId, safety_tag: tag },
      requiredAction: "manual_confirmation"
    }));
    const ruleIssues = (context.safetyRules ?? [])
      .filter((rule) =>
        rule.trigger.stepFamily === step.family ||
        rule.trigger.param && step.params[rule.trigger.param] !== undefined ||
        rule.trigger.materialHazard && stepHazards.has(rule.trigger.materialHazard)
      )
      .map((rule): PreflightIssue => ({
        severity: context.mode === "robot-run" && rule.robotRunSeverity ? rule.robotRunSeverity : rule.severity,
        code: "E_RUNTIME_SAFETY_RULE",
        kind: "safety",
        stepId: step.stepId,
        message: rule.message,
        facts: { step_id: step.stepId, rule_id: rule.ruleId },
        requiredAction: rule.requiresConfirmation ? "manual_confirmation" : "change_context"
      }));

    return [...confirmationIssue, ...tagIssues, ...ruleIssues];
  });

const hasAdapterFor = (
  context: RuntimeContext,
  target: StepFamily | CanonicalProcedureControlNode["kind"]
): boolean =>
  context.adapters?.some((adapter) => adapter.available && adapter.supports?.includes(target)) === true;

const collectControlIssues = (
  plan: RunPlan,
  context: RuntimeContext
): PreflightIssue[] =>
  plan.controls.flatMap((control) => {
    const dynamicIssue: PreflightIssue[] = control.dynamic
      ? [{
          severity: context.mode === "robot-run" && !hasAdapterFor(context, control.kind) ? "error" : "warning",
          code: "E_RUNTIME_CONTROL_DYNAMIC",
          kind: "control",
          controlId: control.controlId,
          message: `Control ${control.controlId} requires runtime decision: ${control.kind}`,
          facts: { control_id: control.controlId, control_kind: control.kind },
          requiredAction: context.mode === "robot-run" ? "provide_adapter" : "manual_confirmation"
        }]
      : [];
    const parallelIssue: PreflightIssue[] = control.kind === "parallel"
      ? [{
          severity: context.mode === "robot-run" ? "error" : "warning",
          code: "E_RUNTIME_RESOURCE_CONFLICT",
          kind: "resource_conflict",
          controlId: control.controlId,
          message: `Parallel control ${control.controlId} requires resource conflict review.`,
          facts: { control_id: control.controlId, control_kind: control.kind },
          requiredAction: "reduce_parallelism"
        }]
      : [];
    const ruleIssues = (context.safetyRules ?? [])
      .filter((rule) => rule.trigger.controlKind === control.kind)
      .map((rule): PreflightIssue => ({
        severity: context.mode === "robot-run" && rule.robotRunSeverity ? rule.robotRunSeverity : rule.severity,
        code: "E_RUNTIME_SAFETY_RULE",
        kind: "safety",
        controlId: control.controlId,
        message: rule.message,
        facts: { control_id: control.controlId, rule_id: rule.ruleId },
        requiredAction: rule.requiresConfirmation ? "manual_confirmation" : "change_procedure"
      }));

    return [...dynamicIssue, ...parallelIssue, ...ruleIssues];
  });
