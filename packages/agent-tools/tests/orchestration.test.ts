import { describe, expect, it } from "vitest";

import {
  appendToolCall,
  applyPatchDecision,
  approvePatchDecision,
  attachEvidence,
  createAgentRun,
  getAuditTimeline,
  proposePatch,
  rejectPatchDecision,
  transitionAgentRunStatus,
  type PatchProposal
} from "../src/index";
import { citedRagEvidence, proposal, toolCall } from "./fixtures";

describe("agent orchestration state machine", () => {
  it("creates deterministic agent runs with an audit timeline", () => {
    const run = createAgentRun({
      agentRunId: "run-1",
      workspaceId: "workspace-1",
      goal: "Repair reaction yield",
      targetFiles: ["reaction.chemd"],
      createdAt: "2026-05-12T10:00:00.000Z"
    });

    expect(run).toMatchObject({
      agentRunId: "run-1",
      status: "created",
      targetFiles: ["reaction.chemd"],
      auditTimeline: [
        {
          eventId: "run-1:event:1",
          type: "run_created",
          toStatus: "created"
        }
      ]
    });
  });

  it("transitions status, appends tool calls, and attaches evidence", () => {
    const running = transitionAgentRunStatus(createRun(), { status: "running" });
    expect(running.ok).toBe(true);

    const withTool = appendToolCall(running.run, { toolCall });
    expect(withTool.ok).toBe(true);
    expect(withTool.run.toolCalls).toHaveLength(1);

    const withEvidence = attachEvidence(withTool.run, {
      evidence: [citedRagEvidence]
    });
    expect(withEvidence.ok).toBe(true);
    expect(withEvidence.run.evidence).toHaveLength(1);
    expect(getAuditTimeline(withEvidence.run).map((event) => event.type)).toEqual([
      "run_created",
      "status_transitioned",
      "tool_call_appended",
      "evidence_attached"
    ]);
  });

  it("prevents illegal status transitions", () => {
    const result = transitionAgentRunStatus(createRun(), { status: "completed" });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_status_transition"
      }
    });
  });

  it("prevents appending tool calls after completion", () => {
    const running = transitionAgentRunStatus(createRun(), { status: "running" });
    const completed = transitionAgentRunStatus(running.run, { status: "completed" });
    const result = appendToolCall(completed.run, { toolCall });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "append_tool_call_after_terminal_status"
      }
    });
  });

  it("records approve, reject, and apply decisions", () => {
    const proposed = createProposedRun();
    const approved = approvePatchDecision(proposed.run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1"
    });
    const applied = applyPatchDecision(approved.run, {
      decisionId: "decision-2",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(applied.ok).toBe(true);
    expect(applied.run.status).toBe("applying_patch");
    expect(applied.run.patchDecisions.map((decision) => decision.kind)).toEqual([
      "approved",
      "applied"
    ]);
    expect(getAuditTimeline(applied.run).map((event) => event.type)).toEqual([
      "run_created",
      "status_transitioned",
      "patch_proposed",
      "patch_approved",
      "patch_applied"
    ]);

    const rejected = rejectPatchDecision(proposed.run, {
      decisionId: "decision-3",
      patchProposalId: "patch-1",
      reason: "User wants manual review"
    });
    expect(rejected.ok).toBe(true);
    expect(rejected.run.patchDecisions).toMatchObject([
      {
        kind: "rejected",
        reason: "User wants manual review"
      }
    ]);
  });

  it("prevents applying patches before approval", () => {
    const proposed = createProposedRun();
    const result = applyPatchDecision(proposed.run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "patch_approval_missing"
      }
    });
  });

  it("prevents applying patches with mismatched approval ids", () => {
    const approved = approvePatchDecision(createProposedRun().run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1"
    });
    const result = applyPatchDecision(approved.run, {
      decisionId: "decision-2",
      patchProposalId: "patch-1",
      userApprovalId: "approval-other",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "patch_approval_id_mismatch"
      }
    });
  });

  it("prevents applying patches when approval has no usable id", () => {
    const approved = approvePatchDecision(createProposedRun().run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1"
    });
    const result = applyPatchDecision(approved.run, {
      decisionId: "decision-2",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "patch_approval_id_missing"
      }
    });
  });

  it("prevents applying the same patch twice", () => {
    const approved = approvePatchDecision(createProposedRun().run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1"
    });
    const applied = applyPatchDecision(approved.run, {
      decisionId: "decision-2",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });
    const repeated = applyPatchDecision(applied.run, {
      decisionId: "decision-3",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(repeated).toMatchObject({
      ok: false,
      error: {
        code: "patch_already_applied"
      }
    });
  });

  it("prevents applying patches after failed or canceled status", () => {
    const proposed = createProposedRun();
    const failed = transitionAgentRunStatus(proposed.run, { status: "failed" });
    const failedApply = applyPatchDecision(failed.run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(failedApply).toMatchObject({
      ok: false,
      error: {
        code: "patch_decision_after_terminal_status"
      }
    });

    const canceled = transitionAgentRunStatus(proposed.run, { status: "canceled" });
    const canceledApply = applyPatchDecision(canceled.run, {
      decisionId: "decision-2",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(canceledApply).toMatchObject({
      ok: false,
      error: {
        code: "patch_decision_after_terminal_status"
      }
    });
  });

  it("records a blocked audit event when apply gate rejects evidence", () => {
    const proposed = createProposedRun({
      ...proposal,
      evidence: [
        {
          kind: "rag",
          summary: "Uncited RAG patch support"
        }
      ]
    });
    const approved = approvePatchDecision(proposed.run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1"
    });
    const result = applyPatchDecision(approved.run, {
      decisionId: "decision-1",
      patchProposalId: "patch-1",
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "rag_evidence_missing_citation"
      }
    });
    expect(getAuditTimeline(result.run).at(-1)).toMatchObject({
      type: "decision_blocked",
      error: {
        code: "rag_evidence_missing_citation"
      }
    });
  });
});

const createRun = () =>
  createAgentRun({
    agentRunId: "run-1",
    workspaceId: "workspace-1",
    goal: "Repair reaction yield"
  });

const createProposedRun = (patchProposal: PatchProposal = proposal) => {
  const running = transitionAgentRunStatus(createRun(), { status: "running" });

  return proposePatch(running.run, { patchProposal });
};
