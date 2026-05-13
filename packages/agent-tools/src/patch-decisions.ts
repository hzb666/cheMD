import { canApplyApprovedPatch, isNonBlankString } from "./safety";
import {
  ensureRunIsActive,
  fail,
  ok,
  withAudit
} from "./run-internals";
import type {
  AgentAuditEvent,
  AgentRun,
  AgentRunMutationResult,
  AgentRunStatus,
  AgentToolError,
  ApplyPatchDecisionInput,
  PatchDecision,
  PatchDecisionInput
} from "./types";

interface AppendPatchDecisionOptions {
  kind: PatchDecision["kind"];
  eventType: AgentAuditEvent["type"];
  nextStatus?: AgentRunStatus;
}

type PatchDecisionFailure = {
  ok: false;
  run: AgentRun;
  error: AgentToolError;
};

type PatchApprovalValidationResult =
  | {
      ok: true;
      approvalId: string;
    }
  | PatchDecisionFailure;

export const approvePatchDecision = (
  run: AgentRun,
  input: PatchDecisionInput
): AgentRunMutationResult =>
  appendPatchDecision(run, input, {
    kind: "approved",
    eventType: "patch_approved"
  });

export const rejectPatchDecision = (
  run: AgentRun,
  input: PatchDecisionInput
): AgentRunMutationResult =>
  appendPatchDecision(run, input, {
    kind: "rejected",
    eventType: "patch_rejected"
  });

export const applyPatchDecision = (
  run: AgentRun,
  input: ApplyPatchDecisionInput
): AgentRunMutationResult => {
  const decisionResult = validatePatchDecisionTarget(run, input.patchProposalId);
  if (!decisionResult.ok) {
    return decisionResult;
  }

  const proposal = findPatchProposal(decisionResult.run, input.patchProposalId);
  if (proposal === undefined) {
    return fail(run, "patch_proposal_not_found", `Patch proposal not found: ${input.patchProposalId}`);
  }

  const approvalResult = validatePatchApprovalDecision(run, input);
  if (!approvalResult.ok) {
    return approvalResult;
  }

  const gateResult = canApplyApprovedPatch({
    patchProposal: proposal,
    userApprovalId: approvalResult.approvalId,
    currentBeforeHash: input.currentBeforeHash
  });

  if (!gateResult.allowed) {
    return failWithAudit(run, gateResult.error, input);
  }

  return appendPatchDecision(run, input, {
    kind: "applied",
    eventType: "patch_applied",
    nextStatus: "applying_patch"
  });
};

const appendPatchDecision = (
  run: AgentRun,
  input: PatchDecisionInput,
  options: AppendPatchDecisionOptions
): AgentRunMutationResult => {
  const targetResult = validatePatchDecisionTarget(run, input.patchProposalId);
  if (!targetResult.ok) {
    return targetResult;
  }

  const decision = createPatchDecision(input, options.kind);
  const nextRun = withAudit({
    ...run,
    patchDecisions: [...run.patchDecisions, decision],
    status: options.nextStatus ?? run.status,
    updatedAt: input.decidedAt ?? run.updatedAt
  }, {
    type: options.eventType,
    summary: input.reason ?? `Patch ${options.kind}: ${input.patchProposalId}`,
    at: input.decidedAt,
    patchProposalId: input.patchProposalId,
    decisionId: input.decisionId,
    fromStatus: run.status,
    toStatus: options.nextStatus
  });

  return ok(nextRun);
};

const validatePatchDecisionTarget = (
  run: AgentRun,
  patchProposalId: string
): AgentRunMutationResult => {
  const activityResult = ensureRunIsActive(run, "patch_decision_after_terminal_status");
  if (!activityResult.allowed) {
    return fail(run, activityResult.error.code, activityResult.error.message);
  }

  if (findPatchProposal(run, patchProposalId) === undefined) {
    return fail(run, "patch_proposal_not_found", `Patch proposal not found: ${patchProposalId}`);
  }

  if (hasRejectedPatch(run, patchProposalId)) {
    return fail(run, "patch_proposal_rejected", `Patch proposal was rejected: ${patchProposalId}`);
  }

  if (hasAppliedPatch(run, patchProposalId)) {
    return fail(run, "patch_already_applied", `Patch proposal was already applied: ${patchProposalId}`);
  }

  return ok(run);
};

const validatePatchApprovalDecision = (
  run: AgentRun,
  input: ApplyPatchDecisionInput
): PatchApprovalValidationResult => {
  const approvedDecision = findApprovedDecision(run, input.patchProposalId);
  if (approvedDecision === undefined) {
    return failWithAudit(run, {
      code: "patch_approval_missing",
      message: `Patch proposal must be approved before apply: ${input.patchProposalId}`
    }, input);
  }

  if (!isNonBlankString(approvedDecision.userApprovalId)) {
    return failWithAudit(run, {
      code: "patch_approval_id_missing",
      message: `Approved patch decision requires a usable userApprovalId: ${input.patchProposalId}`
    }, input);
  }

  if (
    isNonBlankString(input.userApprovalId) &&
    input.userApprovalId !== approvedDecision.userApprovalId
  ) {
    return failWithAudit(run, {
      code: "patch_approval_id_mismatch",
      message: `Apply userApprovalId does not match approved decision: ${input.patchProposalId}`
    }, input);
  }

  return {
    ok: true,
    approvalId: approvedDecision.userApprovalId
  };
};

const createPatchDecision = (
  input: PatchDecisionInput,
  kind: PatchDecision["kind"]
): PatchDecision => ({
  decisionId: input.decisionId,
  patchProposalId: input.patchProposalId,
  kind,
  ...(isNonBlankString(input.userApprovalId) ? { userApprovalId: input.userApprovalId } : {}),
  ...(input.reason === undefined ? {} : { reason: input.reason }),
  ...(input.decidedAt === undefined ? {} : { decidedAt: input.decidedAt })
});

const failWithAudit = (
  run: AgentRun,
  error: AgentToolError,
  input: ApplyPatchDecisionInput
): PatchDecisionFailure => ({
  ok: false,
  run: withAudit(run, {
    type: "decision_blocked",
    summary: error.message,
    at: input.decidedAt,
    patchProposalId: input.patchProposalId,
    decisionId: input.decisionId,
    error
  }),
  error
});

const hasRejectedPatch = (run: AgentRun, patchProposalId: string): boolean =>
  run.patchDecisions.some(
    (decision) => decision.patchProposalId === patchProposalId && decision.kind === "rejected"
  );

const hasAppliedPatch = (run: AgentRun, patchProposalId: string): boolean =>
  run.patchDecisions.some(
    (decision) => decision.patchProposalId === patchProposalId && decision.kind === "applied"
  );

const findApprovedDecision = (run: AgentRun, patchProposalId: string) =>
  run.patchDecisions.find(
    (decision) => decision.patchProposalId === patchProposalId && decision.kind === "approved"
  );

const findPatchProposal = (run: AgentRun, patchProposalId: string) =>
  run.patchProposals.find((item) => item.patchProposalId === patchProposalId);
