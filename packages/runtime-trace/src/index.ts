export type TraceEventType =
  | "run_started"
  | "step_started"
  | "step_completed"
  | "step_failed"
  | "observation_recorded"
  | "analysis_recorded"
  | "diagnostic_emitted"
  | "manual_override"
  | "run_completed";

export interface TraceEvent {
  eventId: string;
  runId: string;
  timestamp: string;
  type: TraceEventType;
  stepId?: string;
  payload?: Record<string, unknown>;
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
  eventCount: number;
}

export const createTraceEvent = (event: TraceEvent): TraceEvent => ({
  ...event,
  payload: event.payload ? { ...event.payload } : undefined
});

const unique = (values: string[]): string[] => Array.from(new Set(values));

export const replayTrace = (input: ReplayTraceInput): ReplayResult => {
  const runEvents = input.events.filter((event) => event.runId === input.runId);
  const completedStepIds = unique(
    runEvents
      .filter((event) => event.type === "step_completed" && event.stepId)
      .map((event) => event.stepId as string)
  );
  const failedStepIds = unique(
    runEvents
      .filter((event) => event.type === "step_failed" && event.stepId)
      .map((event) => event.stepId as string)
  );
  const status = failedStepIds.length > 0
    ? "failed"
    : completedStepIds.length === input.stepIds.length
      ? "completed"
      : "running";

  return {
    runId: input.runId,
    status,
    completedStepIds,
    failedStepIds,
    eventCount: runEvents.length
  };
};
