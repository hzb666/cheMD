import type { CanonicalStepNode, StepFamily } from "./types";

export type ProcedureStateViolationCode =
  | "E_STATE_MIXTURE_REQUIRED"
  | "E_STATE_ACTIVE_REACTION_REQUIRED"
  | "E_STATE_BIPHASIC_REQUIRED";

export interface ProcedureStateFlags {
  biphasic: boolean;
  mixturePresent: boolean;
  quenched: boolean;
  reactionActive: boolean;
}

export interface ProcedureStateViolation {
  code: ProcedureStateViolationCode;
  currentState: string[];
  message: string;
  requiredState: string;
  stepFamily: StepFamily;
  stepId: string;
}

const MIXTURE_CONSUMERS = new Set<StepFamily>([
  "heat",
  "cool",
  "hold",
  "purge",
  "quench",
  "extract",
  "wash",
  "filter",
  "dry",
  "concentrate",
  "purify",
  "sample",
  "analyze"
]);

const ACTIVE_REACTION_CONSUMERS = new Set<StepFamily>([
  "heat",
  "cool",
  "hold",
  "purge"
]);

export const createInitialProcedureStateFlags = (): ProcedureStateFlags => ({
  biphasic: false,
  mixturePresent: false,
  quenched: false,
  reactionActive: false
});

export const readProcedureStateTags = (flags: ProcedureStateFlags): string[] => [
  ...(flags.mixturePresent ? ["mixture_present"] : []),
  ...(flags.reactionActive ? ["reaction_active"] : []),
  ...(flags.quenched ? ["quenched"] : []),
  ...(flags.biphasic ? ["biphasic"] : [])
];

export const validateProcedureStatePreconditions = (
  flags: ProcedureStateFlags,
  step: CanonicalStepNode
): ProcedureStateViolation[] => {
  const violations: ProcedureStateViolation[] = [];
  const currentState = readProcedureStateTags(flags);
  const hasIncomingMaterial = hasStepMaterial(step);

  if (MIXTURE_CONSUMERS.has(step.family) && !flags.mixturePresent && !hasIncomingMaterial) {
    violations.push(createViolation(
      step,
      "E_STATE_MIXTURE_REQUIRED",
      "mixture_present",
      currentState,
      `Step ${step.stepId} requires an existing mixture or explicit input material.`
    ));
  }

  if (ACTIVE_REACTION_CONSUMERS.has(step.family) && flags.quenched) {
    violations.push(createViolation(
      step,
      "E_STATE_ACTIVE_REACTION_REQUIRED",
      "reaction_active",
      currentState,
      `Step ${step.stepId} requires an active reaction before workup or quench.`
    ));
  }

  if (step.family === "separate_layers" && !flags.biphasic) {
    violations.push(createViolation(
      step,
      "E_STATE_BIPHASIC_REQUIRED",
      "biphasic",
      currentState,
      `Step ${step.stepId} requires a biphasic state created by extract or wash.`
    ));
  }

  return violations;
};

export const applyProcedureStateEffects = (
  flags: ProcedureStateFlags,
  step: CanonicalStepNode
): ProcedureStateFlags => {
  const next = { ...flags };
  if (startsOrExtendsMixture(step)) {
    next.mixturePresent = true;
    next.quenched = false;
    next.reactionActive = true;
  }
  if (step.family === "quench") {
    next.mixturePresent = true;
    next.quenched = true;
    next.reactionActive = false;
  }
  if (step.family === "extract" || step.family === "wash") {
    next.mixturePresent = true;
    next.biphasic = true;
  }
  if (step.family === "concentrate" || step.family === "purify") {
    next.biphasic = false;
  }
  return next;
};

const createViolation = (
  step: CanonicalStepNode,
  code: ProcedureStateViolationCode,
  requiredState: string,
  currentState: string[],
  message: string
): ProcedureStateViolation => ({
  code,
  currentState,
  message,
  requiredState,
  stepFamily: step.family,
  stepId: step.stepId
});

const startsOrExtendsMixture = (step: CanonicalStepNode): boolean =>
  ["charge", "add", "transfer", "mix"].includes(step.family) && hasStepMaterial(step);

const hasStepMaterial = (step: CanonicalStepNode): boolean =>
  Boolean(step.inputs?.length)
  || hasParamValue(step.params.inputs)
  || hasParamValue(step.params.materials)
  || hasParamValue(step.params.agent)
  || hasParamValue(step.params.solvent);

const hasParamValue = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
};
