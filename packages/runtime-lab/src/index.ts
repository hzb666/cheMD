import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";
import type { CanonicalStepNode, StepFamily, StepGraph } from "@chemd/step-ontology";
import type { TypedSemanticGraph } from "@chemd/typechecker";
import {
  initializeStepStates,
  type RuntimeStepState,
  type RuntimeTraceEvent
} from "./state-machine";
export {
  completeStep,
  confirmStep,
  failStep,
  initializeStepStates,
  recordRuntimeDiagnostic,
  startStep,
  type RuntimeStepState,
  type RuntimeTraceEvent
} from "./state-machine";

export type RuntimeMode = "dry-run" | "human-run" | "robot-run" | "replay-run";

export type RunStatus = "created" | "planned" | "running" | "paused" | "completed" | "failed" | "aborted";

export type RuntimeStepStatus =
  | "planned"
  | "ready"
  | "waiting_confirmation"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type RuntimeConfirmationStrategy = "none" | "manual_required" | "review_inferred";

export type CapabilityType =
  | "stirring"
  | "cooling"
  | "heating"
  | "inert_gas"
  | "vacuum"
  | "filtration"
  | "chromatography"
  | "analytical_tlc"
  | "nmr"
  | "hplc";

export interface RuntimeStep {
  stepId: string;
  order: number;
  family: StepFamily;
  params: Record<string, unknown>;
  status: RuntimeStepStatus;
  requiredCapabilities: CapabilityType[];
  requiresConfirmation: boolean;
  confirmationStrategy: RuntimeConfirmationStrategy;
  sourceType?: CanonicalStepNode["source"]["sourceType"];
  dependsOn?: string[];
  outputs?: CanonicalStepNode["outputs"];
  artifacts?: NonNullable<CanonicalStepNode["artifacts"]>;
  source: CanonicalStepNode["source"];
}

export interface RunPlanInput {
  documentId?: string;
  typedGraph?: TypedSemanticGraph;
  stepGraph: StepGraph;
}

export interface RunPlan {
  planId: string;
  documentId: string;
  status: "planned";
  steps: RuntimeStep[];
  diagnostics: V03Diagnostic[];
}

export interface RuntimeContext {
  capabilities: CapabilityType[];
  mode?: RuntimeMode;
}

export interface PreflightResult {
  blocking: boolean;
  diagnostics: V03Diagnostic[];
}

export interface LabState {
  runId: string;
  planId: string;
  mode: RuntimeMode;
  status: RunStatus;
  currentStepId?: string;
  stepStates: RuntimeStepState[];
  resources: Array<{ kind: CapabilityType; available: boolean }>;
  artifacts: Array<{ artifactId: string; kind: string; linkedStepId?: string }>;
  observations: Array<{ observationId: string; linkedStepId?: string; rawText?: string }>;
  diagnostics: V03Diagnostic[];
  trace: RuntimeTraceEvent[];
}

export interface CreateLabStateOptions {
  runId: string;
  mode?: RuntimeMode;
}

const CAPABILITIES_BY_FAMILY: Partial<Record<StepFamily, CapabilityType[]>> = {
  cool: ["cooling"],
  heat: ["heating"],
  purge: ["inert_gas"],
  filter: ["filtration"],
  purify: ["chromatography"],
  dry: ["vacuum"],
  concentrate: ["vacuum"]
};

const MANUAL_CONFIRMATION_FAMILIES = new Set<StepFamily>([
  "add",
  "quench",
  "purge",
  "heat",
  "cool"
]);

const KNOWN_STEP_FAMILIES = new Set<string>([
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

const analysisCapabilities = (step: CanonicalStepNode): CapabilityType[] => {
  const type = typeof step.params.type === "string" ? step.params.type.toLowerCase() : "";

  if (type === "tlc") {
    return ["analytical_tlc"];
  }

  if (type === "nmr") {
    return ["nmr"];
  }

  if (type === "hplc") {
    return ["hplc"];
  }

  return [];
};

const requiredCapabilitiesForStep = (step: CanonicalStepNode): CapabilityType[] => [
  ...(CAPABILITIES_BY_FAMILY[step.family] ?? []),
  ...(step.family === "analyze" ? analysisCapabilities(step) : [])
];

const selectConfirmationStrategy = (step: CanonicalStepNode): RuntimeConfirmationStrategy => {
  if (step.source.sourceType === "lowered_step" || step.loweringConfidence < 0.85) {
    return "review_inferred";
  }

  return MANUAL_CONFIRMATION_FAMILIES.has(step.family) ? "manual_required" : "none";
};

const toRuntimeStep = (step: CanonicalStepNode, index: number): RuntimeStep => ({
  stepId: step.stepId,
  order: index + 1,
  family: step.family,
  params: step.params,
  status: "planned",
  requiredCapabilities: requiredCapabilitiesForStep(step),
  requiresConfirmation: selectConfirmationStrategy(step) !== "none",
  confirmationStrategy: selectConfirmationStrategy(step),
  sourceType: step.source.sourceType,
  dependsOn: step.dependsOn,
  outputs: step.outputs,
  artifacts: step.artifacts,
  source: step.source
});

const createMissingCapabilityDiagnostic = (
  step: RuntimeStep,
  capability: CapabilityType
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E605",
    severity: "error",
    message: `Step ${step.stepId} requires missing capability: ${capability}`,
    sourceLayer: "runtime_preflight",
    sourceNodeType: step.source.sourceNodeType,
    sourceNodeId: step.source.sourceNodeId,
    facts: {
      step_family: step.family,
      capability
    }
  });

const createUnknownRobotStepDiagnostic = (step: RuntimeStep): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_RUNTIME_UNKNOWN_STEP",
    severity: "error",
    message: `Unknown step family cannot enter robot-run: ${step.family}`,
    sourceLayer: "runtime_preflight",
    sourceNodeType: step.source.sourceNodeType,
    sourceNodeId: step.source.sourceNodeId,
    facts: {
      step_family: step.family,
      mode: "robot-run"
    }
  });

const isKnownStepFamily = (family: StepFamily): boolean =>
  KNOWN_STEP_FAMILIES.has(family);

export const buildRunPlan = (input: RunPlanInput): RunPlan => {
  const documentId = input.documentId ?? input.typedGraph?.documentId ?? "document";
  const steps = input.stepGraph.steps.map((step, index) => toRuntimeStep(step, index));

  return {
    planId: `runplan::${documentId}`,
    documentId,
    status: "planned",
    steps,
    diagnostics: [...input.stepGraph.diagnostics]
  };
};

export const preflightRun = (plan: RunPlan, context: RuntimeContext): PreflightResult => {
  const available = new Set(context.capabilities);
  const capabilityDiagnostics = plan.steps.flatMap((step) =>
    step.requiredCapabilities
      .filter((capability) => !available.has(capability))
      .map((capability) => createMissingCapabilityDiagnostic(step, capability))
  );
  const robotDiagnostics = context.mode === "robot-run"
    ? plan.steps
        .filter((step) => !isKnownStepFamily(step.family))
        .map((step) => createUnknownRobotStepDiagnostic(step))
    : [];
  const diagnostics = [...capabilityDiagnostics, ...robotDiagnostics];

  return {
    blocking: diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics
  };
};

export const createInitialLabState = (
  plan: RunPlan,
  options: CreateLabStateOptions
): LabState => ({
  runId: options.runId,
  planId: plan.planId,
  mode: options.mode ?? "dry-run",
  status: "planned",
  currentStepId: plan.steps[0]?.stepId,
  stepStates: initializeStepStates(plan.steps),
  resources: [],
  artifacts: [],
  observations: [],
  diagnostics: plan.diagnostics,
  trace: []
});

export const DEFAULT_RUNTIME_CAPABILITIES: CapabilityType[] = [
  "stirring",
  "cooling",
  "heating",
  "inert_gas",
  "vacuum",
  "filtration",
  "chromatography",
  "analytical_tlc",
  "nmr",
  "hplc"
];
