import { allow, toToolError } from "./safety";
import type {
  AgentAuditEvent,
  AgentRun,
  AgentRunMutationResult,
  AgentRunStatus
} from "./types";

const TERMINAL_STATUSES: readonly AgentRunStatus[] = [
  "completed",
  "failed",
  "canceled"
];

const STATUS_TRANSITIONS: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  created: ["running", "blocked", "failed", "canceled"],
  running: [
    "waiting_for_approval",
    "applying_patch",
    "validating",
    "completed",
    "blocked",
    "failed",
    "canceled"
  ],
  waiting_for_approval: [
    "running",
    "applying_patch",
    "validating",
    "blocked",
    "failed",
    "canceled"
  ],
  applying_patch: ["validating", "completed", "blocked", "failed", "canceled"],
  validating: [
    "running",
    "waiting_for_approval",
    "completed",
    "blocked",
    "failed",
    "canceled"
  ],
  blocked: ["running", "failed", "canceled"],
  completed: [],
  failed: [],
  canceled: []
};

export const validateStatusTransition = (
  from: AgentRunStatus,
  to: AgentRunStatus
) => {
  if (from === to || STATUS_TRANSITIONS[from].includes(to)) {
    return allow();
  }

  return {
    allowed: false as const,
    error: toToolError("invalid_status_transition", `Cannot transition from ${from} to ${to}`)
  };
};

export const ensureRunIsActive = (run: AgentRun, code: string) => {
  if (!TERMINAL_STATUSES.includes(run.status)) {
    return allow();
  }

  return {
    allowed: false as const,
    error: toToolError(code, `Cannot mutate agent run after ${run.status}`)
  };
};

export const withAudit = (
  run: AgentRun,
  event: Omit<AgentAuditEvent, "agentRunId" | "eventId">
): AgentRun => ({
  ...run,
  auditTimeline: [
    ...run.auditTimeline,
    {
      ...event,
      agentRunId: run.agentRunId,
      eventId: `${run.agentRunId}:event:${run.auditTimeline.length + 1}`
    }
  ]
});

export const ok = (run: AgentRun): AgentRunMutationResult => ({
  ok: true,
  run
});

export const fail = (
  run: AgentRun,
  code: string,
  message: string
): AgentRunMutationResult => ({
  ok: false,
  run,
  error: toToolError(code, message)
});
