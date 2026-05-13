import {
  ensureRunIsActive,
  fail,
  ok,
  validateStatusTransition,
  withAudit
} from "./run-internals";
import type {
  AgentAuditEvent,
  AgentRun,
  AgentRunMutationResult,
  AppendToolCallInput,
  AttachEvidenceInput,
  CreateAgentRunInput,
  ProposePatchInput,
  TransitionAgentRunInput
} from "./types";

export const createAgentRun = (input: CreateAgentRunInput): AgentRun => {
  const run: AgentRun = {
    agentRunId: input.agentRunId,
    workspaceId: input.workspaceId,
    goal: input.goal,
    targetFiles: input.targetFiles ?? [],
    status: "created",
    toolCalls: [],
    evidence: [],
    patchProposals: [],
    patchDecisions: [],
    auditTimeline: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };

  return withAudit(run, {
    type: "run_created",
    summary: `Agent run created: ${input.goal}`,
    at: input.createdAt,
    toStatus: "created"
  });
};

export const transitionAgentRunStatus = (
  run: AgentRun,
  input: TransitionAgentRunInput
): AgentRunMutationResult => {
  const transitionResult = validateStatusTransition(run.status, input.status);
  if (!transitionResult.allowed) {
    return fail(run, transitionResult.error.code, transitionResult.error.message);
  }

  const nextRun: AgentRun = {
    ...run,
    status: input.status,
    updatedAt: input.at ?? run.updatedAt,
    ...(input.finalSummary === undefined ? {} : { finalSummary: input.finalSummary }),
    ...(input.validationResult === undefined ? {} : { validationResult: input.validationResult })
  };

  return ok(withAudit(nextRun, {
    type: "status_transitioned",
    summary: input.summary ?? `Status changed from ${run.status} to ${input.status}`,
    at: input.at,
    fromStatus: run.status,
    toStatus: input.status
  }));
};

export const appendToolCall = (
  run: AgentRun,
  input: AppendToolCallInput
): AgentRunMutationResult => {
  const activityResult = ensureRunIsActive(run, "append_tool_call_after_terminal_status");
  if (!activityResult.allowed) {
    return fail(run, activityResult.error.code, activityResult.error.message);
  }

  const nextRun = withAudit({
    ...run,
    toolCalls: [...run.toolCalls, input.toolCall],
    updatedAt: input.at ?? run.updatedAt
  }, {
    type: "tool_call_appended",
    summary: input.summary ?? `Tool call appended: ${input.toolCall.toolName}`,
    at: input.at,
    toolCallId: input.toolCall.toolCallId
  });

  return ok(nextRun);
};

export const attachEvidence = (
  run: AgentRun,
  input: AttachEvidenceInput
): AgentRunMutationResult => {
  const activityResult = ensureRunIsActive(run, "attach_evidence_after_terminal_status");
  if (!activityResult.allowed) {
    return fail(run, activityResult.error.code, activityResult.error.message);
  }

  const startIndex = run.evidence.length;
  const evidenceIndexes = input.evidence.map((_, index) => startIndex + index);
  const nextRun = withAudit({
    ...run,
    evidence: [...run.evidence, ...input.evidence],
    updatedAt: input.at ?? run.updatedAt
  }, {
    type: "evidence_attached",
    summary: input.summary ?? `Evidence attached: ${input.evidence.length}`,
    at: input.at,
    evidenceIndexes
  });

  return ok(nextRun);
};

export const proposePatch = (
  run: AgentRun,
  input: ProposePatchInput
): AgentRunMutationResult => {
  const activityResult = ensureRunIsActive(run, "propose_patch_after_terminal_status");
  if (!activityResult.allowed) {
    return fail(run, activityResult.error.code, activityResult.error.message);
  }

  const nextRun = withAudit({
    ...run,
    patchProposals: [...run.patchProposals, input.patchProposal],
    status: "waiting_for_approval",
    updatedAt: input.at ?? run.updatedAt
  }, {
    type: "patch_proposed",
    summary: input.summary ?? `Patch proposed: ${input.patchProposal.title}`,
    at: input.at,
    fromStatus: run.status,
    toStatus: "waiting_for_approval",
    patchProposalId: input.patchProposal.patchProposalId
  });

  return ok(nextRun);
};

export const getAuditTimeline = (run: AgentRun): readonly AgentAuditEvent[] =>
  run.auditTimeline;
