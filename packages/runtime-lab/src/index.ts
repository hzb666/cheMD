import type { V03Diagnostic } from "@chemd/diagnostics";
import {
  STEP_FAMILIES,
  getCapabilitiesForStep,
  getConfirmationRuleForStep,
  getSafetyTagsForStep,
  type CanonicalProcedureControlNode,
  type CanonicalStepNode,
  type StepCapability,
  type StepFamily,
  type StepGraph
} from "@chemd/step-ontology";
import type { TypedSemanticGraph } from "@chemd/typechecker";
import {
  initializeStepStates,
  type RuntimeStepState,
  type RuntimeTraceEvent
} from "./state-machine";
export { preflightRun } from "./preflight";
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
export {
  createLabStateStack,
  pushLabStateSnapshot,
  restoreCurrentLabStateSnapshot,
  restoreLabStateSnapshot,
  type LabStateSnapshot,
  type LabStateStack,
  type PushLabStateSnapshotOptions
} from "./state-stack";

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

export type CapabilityType = StepCapability;

export interface RuntimeStep {
  stepId: string;
  order: number;
  family: StepFamily;
  params: Record<string, unknown>;
  status: RuntimeStepStatus;
  requiredCapabilities: CapabilityType[];
  requiresConfirmation: boolean;
  confirmationStrategy: RuntimeConfirmationStrategy;
  safetyTags: string[];
  sourceType?: CanonicalStepNode["source"]["sourceType"];
  dependsOn?: string[];
  inputs?: CanonicalStepNode["inputs"];
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
  controls: RuntimeControl[];
  controlStates: RuntimeControlState[];
  diagnostics: V03Diagnostic[];
}

export interface RuntimeContext {
  capabilities: CapabilityType[];
  mode?: RuntimeMode;
  adapters?: RuntimeAdapterSnapshot[];
  devices?: DeviceCapabilitySnapshot[];
  environment?: RuntimeEnvironmentSnapshot;
  inventory?: InventorySnapshot;
  safetyRules?: SafetyRule[];
}

export interface RuntimeAdapterSnapshot {
  adapterId: string;
  supports?: Array<StepFamily | CanonicalProcedureControlNode["kind"]>;
  available: boolean;
}

export interface DeviceCapabilitySnapshot {
  capability: CapabilityType;
  min?: number;
  max?: number;
  unit?: string;
}

export interface InventorySnapshot {
  materials: Array<{
    id: string;
    available: boolean;
    expired?: boolean;
    amount?: string;
    hazards?: string[];
  }>;
}

export interface RuntimeEnvironmentSnapshot {
  fumeHood?: boolean;
  ppe?: string[];
  wasteStreams?: string[];
}

export interface SafetyRule {
  ruleId: string;
  trigger: {
    stepFamily?: StepFamily;
    materialHazard?: string;
    param?: string;
    controlKind?: CanonicalProcedureControlNode["kind"];
  };
  severity: "info" | "warning" | "error";
  requiresConfirmation?: boolean;
  robotRunSeverity?: "warning" | "error";
  message: string;
}

export interface PreflightIssue {
  severity: "info" | "warning" | "error";
  kind:
    | "capability"
    | "device_range"
    | "inventory"
    | "safety"
    | "environment"
    | "adapter"
    | "control"
    | "resource_conflict";
  stepId?: string;
  controlId?: string;
  message: string;
  requiredAction?:
    | "manual_confirmation"
    | "change_context"
    | "change_procedure"
    | "provide_adapter"
    | "reduce_parallelism";
}

export interface PreflightResult {
  blocking: boolean;
  issues: PreflightIssue[];
  diagnostics: V03Diagnostic[];
}

export interface RuntimeControl {
  controlId: string;
  kind: CanonicalProcedureControlNode["kind"];
  params: Record<string, unknown>;
  dynamic: boolean;
  controlPath: string[];
}

export interface RuntimeControlState {
  controlId: string;
  kind: RuntimeControl["kind"];
  status: "planned" | "waiting_adapter" | "running" | "completed" | "blocked" | "aborted";
  dynamic: boolean;
}

export interface LabState {
  runId: string;
  planId: string;
  mode: RuntimeMode;
  status: RunStatus;
  currentStepId?: string;
  stepStates: RuntimeStepState[];
  controlStates: RuntimeControlState[];
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

const isKnownStepFamily = (family: StepFamily): boolean => STEP_FAMILIES.has(family);

const requiredCapabilitiesForStep = (step: CanonicalStepNode): CapabilityType[] =>
  isKnownStepFamily(step.family) ? getCapabilitiesForStep(step) : [];

const selectConfirmationStrategy = (step: CanonicalStepNode): RuntimeConfirmationStrategy => {
  if (step.source.sourceType === "lowered_step" || step.loweringConfidence < 0.85) {
    return "review_inferred";
  }

  return isKnownStepFamily(step.family)
    ? getConfirmationRuleForStep(step.family).strategy
    : "none";
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
  safetyTags: isKnownStepFamily(step.family) ? getSafetyTagsForStep(step.family) : [],
  sourceType: step.source.sourceType,
  dependsOn: step.dependsOn,
  inputs: step.inputs,
  outputs: step.outputs,
  artifacts: step.artifacts,
  source: step.source
});

const toRuntimeControl = (control: CanonicalProcedureControlNode): RuntimeControl => ({
  controlId: control.controlId,
  kind: control.kind,
  params: control.params,
  dynamic: control.dynamic,
  controlPath: control.controlPath
});

const initializeControlStates = (controls: RuntimeControl[]): RuntimeControlState[] =>
  controls.map((control) => ({
    controlId: control.controlId,
    kind: control.kind,
    status: control.dynamic ? "waiting_adapter" : "planned",
    dynamic: control.dynamic
  }));

export const buildRunPlan = (input: RunPlanInput): RunPlan => {
  const documentId = input.documentId ?? input.typedGraph?.documentId ?? "document";
  const steps = input.stepGraph.steps.map((step, index) => toRuntimeStep(step, index));
  const controls = (input.stepGraph.controls ?? []).map(toRuntimeControl);

  return {
    planId: `runplan::${documentId}`,
    documentId,
    status: "planned",
    steps,
    controls,
    controlStates: initializeControlStates(controls),
    diagnostics: [...input.stepGraph.diagnostics]
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
  controlStates: plan.controlStates.map((control) => ({ ...control })),
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
