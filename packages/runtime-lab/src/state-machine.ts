import { createV03Diagnostic, type V03Diagnostic } from "@chemd/diagnostics";

import type {
  LabState,
  RunPlan,
  RuntimeStep,
  RuntimeStepStatus
} from "./index";

export type RuntimeTraceEventType =
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_skipped"
  | "operator_action"
  | "confirmation_granted"
  | "artifact_generated"
  | "observation_recorded"
  | "diagnostic_recorded";

export interface RuntimeStepState {
  stepId: string;
  status: RuntimeStepStatus;
  startedAt?: string;
  endedAt?: string;
  diagnostics: V03Diagnostic[];
}

export interface RuntimeArtifactRecord {
  artifactId: string;
  kind: string;
  linkedStepId?: string;
}
export interface RuntimeObservationRecord {
  observationId: string;
  linkedStepId?: string;
  rawText?: string;
}
export interface RuntimeTraceEvent {
  traceId: string;
  type: RuntimeTraceEventType;
  timestamp: string;
  stepId?: string;
  operatorId?: string;
  message?: string;
  artifact?: RuntimeArtifactRecord;
  observation?: RuntimeObservationRecord;
  diagnostic?: V03Diagnostic;
}

export interface RuntimeActionOptions {
  operatorId?: string;
}

export interface CompleteStepOptions extends RuntimeActionOptions {
  artifacts?: RuntimeArtifactRecord[];
  observations?: RuntimeObservationRecord[];
}

export const initializeStepStates = (steps: RuntimeStep[]): RuntimeStepState[] =>
  steps.map((step) => ({
    stepId: step.stepId,
    status: getInitialStepStatus(step),
    diagnostics: []
  }));

const getInitialStepStatus = (step: RuntimeStep): RuntimeStepStatus => {
  if (step.dependsOn && step.dependsOn.length > 0) {
    return "planned";
  }

  return step.requiresConfirmation ? "waiting_confirmation" : "ready";
};

const cloneState = (state: LabState): LabState => ({
  ...state,
  stepStates: state.stepStates.map((step) => ({ ...step, diagnostics: [...step.diagnostics] })),
  resources: state.resources.map((resource) => ({ ...resource })),
  artifacts: state.artifacts.map((artifact) => ({ ...artifact })),
  observations: state.observations.map((observation) => ({ ...observation })),
  diagnostics: [...state.diagnostics],
  trace: state.trace.map((event) => ({ ...event }))
});

const createTraceEvent = (
  type: RuntimeTraceEventType,
  input: Omit<RuntimeTraceEvent, "traceId" | "timestamp" | "type">
): RuntimeTraceEvent => ({
  traceId: `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  timestamp: new Date().toISOString(),
  type,
  ...input
});

const findStepState = (state: LabState, stepId: string): RuntimeStepState | undefined =>
  state.stepStates.find((step) => step.stepId === stepId);

const findRuntimeStep = (plan: RunPlan, stepId: string): RuntimeStep | undefined =>
  plan.steps.find((step) => step.stepId === stepId);

const appendTrace = (state: LabState, ...events: RuntimeTraceEvent[]): LabState => ({
  ...state,
  trace: [...state.trace, ...events]
});

const createStepNotReadyDiagnostic = (
  step: RuntimeStep | undefined,
  stepId: string,
  status: RuntimeStepStatus | undefined
): V03Diagnostic =>
  createV03Diagnostic({
    code: "E_RUNTIME_STEP_NOT_READY",
    severity: "error",
    message: `Step ${stepId} cannot start from status ${status ?? "missing"}`,
    sourceLayer: "runtime_preflight",
    sourceNodeType: step?.source.sourceNodeType ?? "procedure",
    sourceNodeId: step?.source.sourceNodeId,
    facts: {
      step_id: stepId,
      status
    }
  });

const addDiagnostic = (state: LabState, diagnostic: V03Diagnostic, stepId?: string): LabState =>
  appendTrace(
    { ...state, diagnostics: [...state.diagnostics, diagnostic] },
    createTraceEvent("diagnostic_recorded", { stepId, diagnostic })
  );

const withStepStatus = (
  state: LabState,
  stepId: string,
  status: RuntimeStepStatus,
  timestampField?: "startedAt" | "endedAt"
): LabState => ({
  ...state,
  stepStates: state.stepStates.map((step) =>
    step.stepId === stepId
      ? { ...step, status, ...(timestampField ? { [timestampField]: new Date().toISOString() } : {}) }
      : step
  )
});

export const confirmStep = (
  state: LabState,
  _plan: RunPlan,
  stepId: string,
  options: RuntimeActionOptions = {}
): LabState => {
  const nextState = cloneState(state);
  const step = findStepState(nextState, stepId);
  if (!step || step.status !== "waiting_confirmation") {
    return nextState;
  }

  step.status = "ready";
  return appendTrace(
    nextState,
    createTraceEvent("operator_action", { stepId, operatorId: options.operatorId }),
    createTraceEvent("confirmation_granted", { stepId, operatorId: options.operatorId })
  );
};

export const startStep = (
  state: LabState,
  plan: RunPlan,
  stepId: string,
  options: RuntimeActionOptions = {}
): LabState => {
  const stepState = findStepState(state, stepId);
  if (stepState?.status !== "ready") {
    return addDiagnostic(
      cloneState(state),
      createStepNotReadyDiagnostic(findRuntimeStep(plan, stepId), stepId, stepState?.status),
      stepId
    );
  }

  const runningState = withStepStatus(cloneState(state), stepId, "running", "startedAt");
  return appendTrace(
    {
      ...runningState,
      status: "running",
      currentStepId: stepId
    },
    createTraceEvent("step_started", { stepId, operatorId: options.operatorId })
  );
};

export const completeStep = (
  state: LabState,
  plan: RunPlan,
  stepId: string,
  options: CompleteStepOptions = {}
): LabState => {
  const stepState = findStepState(state, stepId);
  if (stepState?.status !== "running") {
    return addDiagnostic(
      cloneState(state),
      createStepNotReadyDiagnostic(findRuntimeStep(plan, stepId), stepId, stepState?.status),
      stepId
    );
  }

  const completed = withStepStatus(cloneState(state), stepId, "completed", "endedAt");
  const withOutputs = appendStepOutputs(completed, stepId, options);
  const readyState = refreshReadySteps(withOutputs, plan);
  const status = readyState.stepStates.every((step) => ["completed", "skipped"].includes(step.status))
    ? "completed"
    : "running";

  return appendTrace(
    {
      ...readyState,
      status,
      currentStepId: selectCurrentStepId(readyState)
    },
    createTraceEvent("step_completed", { stepId, operatorId: options.operatorId }),
    ...createOutputTraceEvents(stepId, options)
  );
};

export const failStep = (
  state: LabState,
  _plan: RunPlan,
  stepId: string,
  diagnostic?: V03Diagnostic
): LabState => {
  const failedState = withStepStatus(cloneState(state), stepId, "failed", "endedAt");
  const nextState = diagnostic ? addDiagnostic(failedState, diagnostic, stepId) : failedState;
  return appendTrace(
    { ...nextState, status: "failed" },
    createTraceEvent("step_failed", { stepId })
  );
};

export const recordRuntimeDiagnostic = (
  state: LabState,
  diagnostic: V03Diagnostic,
  stepId?: string
): LabState => addDiagnostic(cloneState(state), diagnostic, stepId);

const appendStepOutputs = (
  state: LabState,
  stepId: string,
  options: CompleteStepOptions
): LabState => ({
  ...state,
  artifacts: [...state.artifacts, ...linkArtifactsToStep(options.artifacts, stepId)],
  observations: [...state.observations, ...linkObservationsToStep(options.observations, stepId)]
});

const linkArtifactsToStep = (
  artifacts: RuntimeArtifactRecord[] | undefined,
  stepId: string
): RuntimeArtifactRecord[] =>
  (artifacts ?? []).map((artifact) => ({
    ...artifact,
    linkedStepId: artifact.linkedStepId ?? stepId
  }));

const linkObservationsToStep = (
  observations: RuntimeObservationRecord[] | undefined,
  stepId: string
): RuntimeObservationRecord[] =>
  (observations ?? []).map((observation) => ({
    ...observation,
    linkedStepId: observation.linkedStepId ?? stepId
  }));

const createOutputTraceEvents = (
  stepId: string,
  options: CompleteStepOptions
): RuntimeTraceEvent[] => [
  ...linkArtifactsToStep(options.artifacts, stepId).map((artifact) =>
    createTraceEvent("artifact_generated", { stepId, artifact })
  ),
  ...linkObservationsToStep(options.observations, stepId).map((observation) =>
    createTraceEvent("observation_recorded", { stepId, observation })
  )
];

const refreshReadySteps = (state: LabState, plan: RunPlan): LabState => ({
  ...state,
  stepStates: state.stepStates.map((stepState) => {
    const runtimeStep = findRuntimeStep(plan, stepState.stepId);
    if (!runtimeStep || stepState.status !== "planned") {
      return stepState;
    }

    if (!areDependenciesCompleted(state, runtimeStep)) {
      return stepState;
    }

    return {
      ...stepState,
      status: runtimeStep.requiresConfirmation ? "waiting_confirmation" : "ready"
    };
  })
});

const areDependenciesCompleted = (state: LabState, step: RuntimeStep): boolean =>
  (step.dependsOn ?? []).every((dependency) => {
    const dependencyState = findStepState(state, dependency);
    return dependencyState?.status === "completed";
  });

const selectCurrentStepId = (state: LabState): string | undefined =>
  state.stepStates.find((step) =>
    ["running", "ready", "waiting_confirmation"].includes(step.status)
  )?.stepId;
