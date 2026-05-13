import {
  canApplyApprovedPatch,
  type PatchDecision,
  type PatchProposal
} from "@chemd/agent-tools";

import {
  buildEvidenceWarningCodes,
  countCitations
} from "./desktop-agent-timeline-panel-format";
import type {
  DesktopAgentPatchDecisionRow,
  DesktopAgentPatchGate,
  DesktopAgentPatchRow,
  DesktopAgentTimelinePanelOptions
} from "./desktop-agent-timeline-panel-types";

export const buildPatchRow = (
  decisions: readonly PatchDecision[],
  proposal: PatchProposal,
  options: DesktopAgentTimelinePanelOptions
): DesktopAgentPatchRow => {
  const relatedDecisions = decisions.filter((item) =>
    item.patchProposalId === proposal.patchProposalId
  );
  const gate = buildPatchGate(proposal, relatedDecisions, options.currentBeforeHash);

  return {
    patchProposalId: proposal.patchProposalId,
    documentId: proposal.documentId,
    baseRevisionId: proposal.baseRevisionId,
    title: proposal.title,
    rationale: proposal.rationale,
    beforeHash: proposal.beforeHash,
    editCount: proposal.edits.length,
    evidenceCount: proposal.evidence.length,
    citationCount: countCitations(proposal.evidence),
    decisions: relatedDecisions.map(buildPatchDecisionRow),
    gate,
    warnings: buildEvidenceWarningCodes(proposal.evidence)
  };
};

export const selectPatchGate = (
  patches: readonly DesktopAgentPatchRow[]
): DesktopAgentPatchGate => {
  const latest = patches[patches.length - 1];
  if (latest === undefined) {
    return { status: "idle", message: "No patch proposal is waiting for review." };
  }

  return latest.gate;
};

const buildPatchGate = (
  proposal: PatchProposal,
  decisions: readonly PatchDecision[],
  currentBeforeHash?: string
): DesktopAgentPatchGate => {
  if (hasDecision(decisions, "applied")) {
    return { status: "applied", message: "Patch was applied after explicit approval." };
  }

  if (hasDecision(decisions, "rejected")) {
    return { status: "rejected", message: "Patch was rejected by the user." };
  }

  const approval = decisions.find((decision) => decision.kind === "approved");
  if (approval === undefined) {
    return { status: "requires_approval", message: "Patch requires explicit user approval." };
  }

  const gateResult = canApplyApprovedPatch({
    patchProposal: proposal,
    userApprovalId: approval.userApprovalId,
    currentBeforeHash
  });

  return gateResult.allowed
    ? { status: "ready_to_apply", message: "Patch is approved and passed safety checks." }
    : {
        status: "blocked",
        message: gateResult.error.message,
        errorCode: gateResult.error.code
      };
};

const buildPatchDecisionRow = (decision: PatchDecision): DesktopAgentPatchDecisionRow => ({
  decisionId: decision.decisionId,
  kind: decision.kind,
  decidedAt: decision.decidedAt,
  reason: decision.reason,
  userApprovalId: decision.userApprovalId
});

const hasDecision = (
  decisions: readonly PatchDecision[],
  kind: PatchDecision["kind"]
): boolean => decisions.some((decision) => decision.kind === kind);
