import {
  createInitialLabState,
  type LabState,
  type RunPlan,
  type RuntimeTraceEvent
} from "@chemd/runtime-lab";

export type TraceEventType =
  | "run_started"
  | "run_aborted"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "step_skipped"
  | "control_entered"
  | "control_completed"
  | "control_blocked"
  | "control_aborted"
  | "operator_action"
  | "confirmation_granted"
  | "artifact_generated"
  | "observation_recorded"
  | "measurement_recorded"
  | "analysis_recorded"
  | "deviation_recorded"
  | "diagnostic_recorded"
  | "diagnostic_emitted"
  | "manual_override"
  | "resource_consumed"
  | "run_completed";

export interface ObservationRecordedPayload {
  observationId: string;
  rawText?: string;
  linkedStepId?: string;
  artifactIds?: string[];
}

export interface AnalysisRecordedPayload {
  analysisId: string;
  analysisType?: string;
  result?: unknown;
  linkedStepId?: string;
  artifactIds?: string[];
}

export interface ManualOverridePayload {
  reason: string;
  operator?: string;
  field?: string;
  previousValue?: unknown;
  nextValue?: unknown;
}

export interface ArtifactTracePayload {
  artifactId: string;
  kind: string;
  linkedStepId?: string;
}

export type TracePayload =
  | ObservationRecordedPayload
  | AnalysisRecordedPayload
  | ManualOverridePayload
  | ArtifactTracePayload
  | Record<string, unknown>;

export interface TraceEvent {
  eventId: string;
  runId: string;
  timestamp: string;
  type: TraceEventType;
  stepId?: string;
  controlId?: string;
  payload?: TracePayload;
  artifactId?: string;
}

export interface ReplayTraceInput {
  runId: string;
  stepIds: string[];
  events: TraceEvent[];
}

export interface ReplayResult {
  runId: string;
  status: "running" | "completed" | "failed";
  completedStepIds: string[];
  failedStepIds: string[];
  unknownStepIds: string[];
  orderViolations: Array<{ stepId: string; expectedPreviousStepId: string }>;
  artifactIds: string[];
  deviationCount: number;
  manualOverrideCount: number;
  eventCount: number;
}

export const createTraceEvent = (event: TraceEvent): TraceEvent => ({
  ...event,
  payload: event.payload ? { ...event.payload } : undefined
});

const RUNTIME_LAB_EVENT_TYPES: Record<RuntimeTraceEvent["type"], TraceEventType> = {
  run_started: "run_started",
  run_completed: "run_completed",
  run_aborted: "run_aborted",
  step_started: "step_started",
  step_completed: "step_completed",
  step_failed: "step_failed",
  step_skipped: "step_skipped",
  control_entered: "control_entered",
  control_completed: "control_completed",
  control_blocked: "control_blocked",
  control_aborted: "control_aborted",
  operator_action: "operator_action",
  confirmation_granted: "confirmation_granted",
  artifact_generated: "artifact_generated",
  observation_recorded: "observation_recorded",
  measurement_recorded: "measurement_recorded",
  analysis_recorded: "analysis_recorded",
  deviation_recorded: "deviation_recorded",
  manual_override: "manual_override",
  resource_consumed: "resource_consumed",
  diagnostic_recorded: "diagnostic_recorded"
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const createRuntimeLabPayload = (event: RuntimeTraceEvent): TracePayload | undefined => {
  const payload: Record<string, unknown> = {};

  if (event.operatorId) {
    payload.operatorId = event.operatorId;
  }
  if (event.message) {
    payload.message = event.message;
  }
  if (event.artifact) {
    payload.artifact = event.artifact;
  }
  if (event.observation) {
    payload.observation = event.observation;
  }
  if (event.diagnostic) {
    payload.diagnostic = event.diagnostic;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
};

export const adaptRuntimeLabTraceEvents = (
  runId: string,
  events: RuntimeTraceEvent[]
): TraceEvent[] =>
  // runtime-lab owns live execution events; runtime-trace keeps the replay schema stable.
  events.map((event) =>
    createTraceEvent({
      eventId: event.traceId,
      runId,
      timestamp: event.timestamp,
      type: RUNTIME_LAB_EVENT_TYPES[event.type],
      stepId: event.stepId,
      controlId: event.controlId,
      payload: createRuntimeLabPayload(event),
      artifactId: event.artifact?.artifactId
    })
  );

const unique = (values: string[]): string[] => Array.from(new Set(values));

const collectStepIdsByType = (
  events: TraceEvent[],
  type: TraceEventType
): string[] =>
  unique(
    events
      .filter((event) => event.type === type && event.stepId)
      .map((event) => event.stepId as string)
  );

const collectUnknownStepIds = (events: TraceEvent[], knownStepIds: Set<string>): string[] =>
  unique(
    events
      .filter((event) => event.stepId && !knownStepIds.has(event.stepId))
      .map((event) => event.stepId as string)
  );

const filterKnownStepIds = (stepIds: string[], knownStepIds: Set<string>): string[] =>
  stepIds.filter((stepId) => knownStepIds.has(stepId));

const collectOrderViolations = (
  completedStepIds: string[],
  orderedStepIds: string[]
): ReplayResult["orderViolations"] => {
  const completed = new Set<string>();
  const violations: ReplayResult["orderViolations"] = [];

  for (const stepId of completedStepIds) {
    const stepIndex = orderedStepIds.indexOf(stepId);
    const expectedPreviousStepId = stepIndex > 0 ? orderedStepIds[stepIndex - 1] : undefined;

    if (expectedPreviousStepId && !completed.has(expectedPreviousStepId)) {
      violations.push({ stepId, expectedPreviousStepId });
    }

    completed.add(stepId);
  }

  return violations;
};

const collectArtifactIds = (events: TraceEvent[]): string[] =>
  unique(
    events.flatMap((event) => {
      const payload = event.payload;
      const payloadArtifactIds = payload && "artifactIds" in payload && Array.isArray(payload.artifactIds)
        ? payload.artifactIds.filter((artifactId): artifactId is string => typeof artifactId === "string")
        : [];
      const nestedArtifact = payload && "artifact" in payload && isRecord(payload.artifact)
        ? payload.artifact
        : undefined;

      return [
        ...(event.artifactId ? [event.artifactId] : []),
        ...(payload && "artifactId" in payload && typeof payload.artifactId === "string" ? [payload.artifactId] : []),
        ...(typeof nestedArtifact?.artifactId === "string" ? [nestedArtifact.artifactId] : []),
        ...payloadArtifactIds
      ];
    })
  );

export const replayTrace = (input: ReplayTraceInput): ReplayResult => {
  const runEvents = input.events.filter((event) => event.runId === input.runId);
  const knownStepIds = new Set(input.stepIds);
  const completedStepIds = filterKnownStepIds(collectStepIdsByType(runEvents, "step_completed"), knownStepIds);
  const failedStepIds = filterKnownStepIds(collectStepIdsByType(runEvents, "step_failed"), knownStepIds);
  const unknownStepIds = collectUnknownStepIds(runEvents, knownStepIds);
  const orderViolations = collectOrderViolations(completedStepIds, input.stepIds);
  const status = failedStepIds.length > 0
    ? "failed"
    : input.stepIds.every((stepId) => completedStepIds.includes(stepId))
      ? "completed"
      : "running";

  return {
    runId: input.runId,
    status,
    completedStepIds,
    failedStepIds,
    unknownStepIds,
    orderViolations,
    artifactIds: collectArtifactIds(runEvents),
    deviationCount: runEvents.filter((event) => event.type === "deviation_recorded").length,
    manualOverrideCount: runEvents.filter((event) => event.type === "manual_override").length,
    eventCount: runEvents.length
  };
};

export const replayTraceToLabState = (
  plan: RunPlan,
  input: ReplayTraceInput
): LabState => {
  const runEvents = input.events
    .filter((event) => event.runId === input.runId)
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const state = createInitialLabState(plan, { runId: input.runId, mode: "replay-run" });

  return {
    ...state,
    status: readReplayStatus(runEvents, input.stepIds),
    stepStates: state.stepStates.map((step) => ({
      ...step,
      status: readStepReplayStatus(step.stepId, runEvents)
    })),
    controlStates: state.controlStates.map((control) => ({
      ...control,
      status: readControlReplayStatus(control.controlId, runEvents)
    })),
    artifacts: collectArtifactIds(runEvents).map((artifactId) => ({ artifactId, kind: "trace_artifact" })),
    observations: runEvents
      .filter((event) => event.type === "observation_recorded")
      .map((event, index) => ({
        observationId: readPayloadString(event.payload, "observationId") ?? `${input.runId}:obs:${index + 1}`,
        linkedStepId: event.stepId,
        rawText: readPayloadString(event.payload, "text") ?? readPayloadString(event.payload, "rawText")
      })),
    trace: createReplayRuntimeTrace(runEvents)
  };
};

const readReplayStatus = (
  events: TraceEvent[],
  stepIds: string[]
): LabState["status"] => {
  if (events.some((event) => event.type === "run_aborted")) {
    return "aborted";
  }
  if (events.some((event) => event.type === "step_failed")) {
    return "failed";
  }
  const completed = new Set(
    events
      .filter((event) => event.type === "step_completed" && event.stepId)
      .map((event) => event.stepId as string)
  );
  return stepIds.every((stepId) => completed.has(stepId)) ? "completed" : "running";
};

const readStepReplayStatus = (
  stepId: string,
  events: TraceEvent[]
): LabState["stepStates"][number]["status"] => {
  if (events.some((event) => event.type === "step_failed" && event.stepId === stepId)) {
    return "failed";
  }
  if (events.some((event) => event.type === "step_completed" && event.stepId === stepId)) {
    return "completed";
  }
  if (events.some((event) => event.type === "step_started" && event.stepId === stepId)) {
    return "running";
  }
  return "planned";
};

const readControlReplayStatus = (
  controlId: string,
  events: TraceEvent[]
): LabState["controlStates"][number]["status"] => {
  if (events.some((event) => event.type === "control_aborted" && event.controlId === controlId)) {
    return "aborted";
  }
  if (events.some((event) => event.type === "control_blocked" && event.controlId === controlId)) {
    return "blocked";
  }
  if (events.some((event) => event.type === "control_completed" && event.controlId === controlId)) {
    return "completed";
  }
  if (events.some((event) => event.type === "control_entered" && event.controlId === controlId)) {
    return "running";
  }
  return "planned";
};

const TRACE_TO_RUNTIME_EVENT_TYPES: Partial<Record<TraceEventType, RuntimeTraceEvent["type"]>> = {
  run_started: "run_started",
  run_completed: "run_completed",
  run_aborted: "run_aborted",
  step_started: "step_started",
  step_completed: "step_completed",
  step_failed: "step_failed",
  step_skipped: "step_skipped",
  control_entered: "control_entered",
  control_completed: "control_completed",
  control_blocked: "control_blocked",
  control_aborted: "control_aborted",
  operator_action: "operator_action",
  confirmation_granted: "confirmation_granted",
  artifact_generated: "artifact_generated",
  observation_recorded: "observation_recorded",
  measurement_recorded: "measurement_recorded",
  analysis_recorded: "analysis_recorded",
  deviation_recorded: "deviation_recorded",
  manual_override: "manual_override",
  resource_consumed: "resource_consumed",
  diagnostic_recorded: "diagnostic_recorded",
  diagnostic_emitted: "diagnostic_recorded"
};

const readPayloadString = (
  payload: TracePayload | undefined,
  field: string
): string | undefined => {
  const record = payload as Record<string, unknown> | undefined;
  return record && typeof record[field] === "string" ? record[field] : undefined;
};

const replayEventToRuntimeTrace = (event: TraceEvent): RuntimeTraceEvent | undefined => {
  const type = TRACE_TO_RUNTIME_EVENT_TYPES[event.type];
  if (!type) {
    return undefined;
  }

  const artifactId = event.artifactId ?? readPayloadString(event.payload, "artifactId");
  const observationId = readPayloadString(event.payload, "observationId");

  return {
    traceId: event.eventId,
    type,
    timestamp: event.timestamp,
    stepId: event.stepId,
    controlId: event.controlId,
    message: readPayloadString(event.payload, "message") ?? readPayloadString(event.payload, "reason"),
    ...(artifactId ? { artifact: { artifactId, kind: readPayloadString(event.payload, "kind") ?? "trace_artifact" } } : {}),
    ...(observationId ? {
      observation: {
        observationId,
        linkedStepId: event.stepId,
        rawText: readPayloadString(event.payload, "text") ?? readPayloadString(event.payload, "rawText")
      }
    } : {})
  };
};

const createReplayRuntimeTrace = (events: TraceEvent[]): RuntimeTraceEvent[] =>
  events.flatMap((event) => {
    const runtimeEvent = replayEventToRuntimeTrace(event);
    return runtimeEvent ? [runtimeEvent] : [];
  });
