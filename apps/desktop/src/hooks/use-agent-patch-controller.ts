import {
  appendToolCall,
  applyPatchDecision,
  approvePatchDecision,
  attachEvidence,
  createAgentRun,
  createToolResult,
  proposePatch,
  rejectPatchDecision,
  transitionAgentRunStatus,
  type AgentEvidence,
  type AgentRun,
  type AgentToolCall,
  type PatchDecision,
  type PatchProposal,
} from "@chemd/agent-tools";
import type { ChemdEditorDiagnostic, ChemdQuickFixProposal } from "@chemd/language-service";
import type {
  AgentOperationResult,
  AgentPatchControllerInput,
  QuickFixCandidate,
} from "../types";
import type { WorkspaceFileEntry } from "../contracts";
import {
  applyTextEdits,
  createEditorSourceHash,
} from "../utils";
import { useEffect } from "react";

// ─── Agent orchestration helpers ────────────────────────────────────────

export const createAgentId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const getLatestPatchProposal = (run: AgentRun | null): PatchProposal | undefined =>
  run?.patchProposals[run.patchProposals.length - 1];

export const findPatchDecision = (
  run: AgentRun | null,
  patchProposalId: string | undefined,
  kind: PatchDecision["kind"]
): PatchDecision | undefined =>
  patchProposalId === undefined
    ? undefined
    : run?.patchDecisions.find((decision) =>
        decision.patchProposalId === patchProposalId && decision.kind === kind
      );

export const createDiagnosticEvidence = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry
): AgentEvidence => ({
  kind: "diagnostic",
  documentId: file.id,
  filePath: file.path,
  sourceRange: diagnostic.range,
  summary: `${diagnostic.code}: ${diagnostic.message}`,
  citation: {
    citationId: `diagnostic:${quickFix.id}`,
    sourceLabel: `${diagnostic.code} quick fix`,
    documentId: file.id,
    filePath: file.path,
    sourceRange: diagnostic.range,
  },
});

export const createQuickFixPatchProposal = (
  diagnostic: ChemdEditorDiagnostic,
  quickFix: ChemdQuickFixProposal,
  file: WorkspaceFileEntry,
  evidence: AgentEvidence
): PatchProposal => ({
  patchProposalId: createAgentId("patch"),
  documentId: file.id,
  baseRevisionId: quickFix.patch.beforeHash,
  beforeHash: quickFix.patch.beforeHash,
  title: quickFix.title,
  rationale: `Use language-service quick fix for ${diagnostic.code}: ${diagnostic.message}`,
  edits: quickFix.patch.edits,
  evidence: [evidence],
});

export const createProposalToolCall = ({
  runId,
  toolCallId,
  workspaceId,
  file,
  candidate,
  evidence,
  at,
}: {
  runId: string;
  toolCallId: string;
  workspaceId: string;
  file: WorkspaceFileEntry;
  candidate: QuickFixCandidate;
  evidence: AgentEvidence;
  at: string;
}): AgentToolCall => ({
  toolCallId,
  agentRunId: runId,
  workspaceId,
  toolName: "propose_repair",
  payload: {
    diagnosticCode: candidate.diagnostic.code,
    quickFixId: candidate.quickFix.id,
    filePath: file.path,
  },
  status: "ok",
  startedAt: at,
  finishedAt: at,
  result: createToolResult({
    toolCallId,
    status: "ok",
    payload: {
      title: candidate.quickFix.title,
      edits: candidate.quickFix.patch.edits.length,
    },
    evidence: [evidence],
  }),
});

export const createAgentProposalRun = (
  candidate: QuickFixCandidate,
  file: WorkspaceFileEntry,
  workspaceId: string
): AgentOperationResult => {
  const now = new Date().toISOString();
  const runId = createAgentId("run");
  const toolCallId = createAgentId("tool");
  const evidence = createDiagnosticEvidence(candidate.diagnostic, candidate.quickFix, file);
  const patchProposal = createQuickFixPatchProposal(
    candidate.diagnostic,
    candidate.quickFix,
    file,
    evidence
  );
  const toolCall = createProposalToolCall({
    runId,
    toolCallId,
    workspaceId,
    file,
    candidate,
    evidence,
    at: now,
  });
  const createdRun = createAgentRun({
    agentRunId: runId,
    workspaceId,
    goal: `Prepare quick fix patch for ${file.path}`,
    targetFiles: [file.path],
    createdAt: now,
  });
  const runningResult = transitionAgentRunStatus(createdRun, {
    status: "running",
    at: now,
    summary: "Collected current language-service diagnostics.",
  });
  if (!runningResult.ok) {
    return { run: runningResult.run, message: { tone: "danger", text: runningResult.error.message } };
  }

  const toolResult = appendToolCall(runningResult.run, {
    toolCall,
    at: now,
    summary: `Proposed repair from quick fix ${candidate.quickFix.id}.`,
  });
  if (!toolResult.ok) {
    return { run: toolResult.run, message: { tone: "danger", text: toolResult.error.message } };
  }

  const evidenceResult = attachEvidence(toolResult.run, {
    evidence: [evidence],
    at: now,
    summary: `Attached diagnostic evidence for ${candidate.diagnostic.code}.`,
  });
  if (!evidenceResult.ok) {
    return { run: evidenceResult.run, message: { tone: "danger", text: evidenceResult.error.message } };
  }

  const proposalResult = proposePatch(evidenceResult.run, {
    patchProposal,
    at: now,
    summary: `Patch proposal awaits explicit approval: ${patchProposal.title}.`,
  });
  return {
    run: proposalResult.run,
    message: proposalResult.ok
      ? { tone: "info", text: "Review the patch proposal, then approve before applying." }
      : { tone: "danger", text: proposalResult.error.message },
  };
};

export const approveAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const result = approvePatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: createAgentId("approval"),
    reason: "User explicitly approved patch proposal.",
    decidedAt: new Date().toISOString(),
  });
  return {
    run: result.run,
    message: result.ok
      ? { tone: "success", text: "Patch approved. Apply is now enabled for the current buffer." }
      : { tone: "danger", text: result.error.message },
  };
};

export const applyAgentRunPatch = (
  run: AgentRun,
  source: string
): { result: AgentOperationResult; nextSource?: string } | null => {
  const activeProposal = getLatestPatchProposal(run);
  const approvedDecision = findPatchDecision(run, activeProposal?.patchProposalId, "approved");
  if (!activeProposal || !approvedDecision) return null;

  const appliedResult = applyPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    userApprovalId: approvedDecision.userApprovalId,
    reason: "Applied approved patch to current editor buffer.",
    decidedAt: new Date().toISOString(),
    currentBeforeHash: createEditorSourceHash(source),
  });
  if (!appliedResult.ok) {
    return {
      result: {
        run: appliedResult.run,
        message: { tone: "danger", text: appliedResult.error.message },
      },
    };
  }

  const completedResult = transitionAgentRunStatus(appliedResult.run, {
    status: "completed",
    at: new Date().toISOString(),
    summary: "Applied approved patch to the editor buffer.",
    finalSummary: "Patch applied locally. Save remains under the normal workspace save flow.",
  });
  return {
    nextSource: applyTextEdits(source, activeProposal.edits),
    result: {
      run: completedResult.run,
      message: completedResult.ok
        ? { tone: "success", text: "Patch applied to the editor buffer. Use Save to persist it." }
        : { tone: "danger", text: completedResult.error.message },
    },
  };
};

export const rejectAgentRunPatch = (run: AgentRun): AgentOperationResult | null => {
  const activeProposal = getLatestPatchProposal(run);
  if (!activeProposal) return null;

  const rejectedResult = rejectPatchDecision(run, {
    decisionId: createAgentId("decision"),
    patchProposalId: activeProposal.patchProposalId,
    reason: "User rejected patch proposal.",
    decidedAt: new Date().toISOString(),
  });
  if (!rejectedResult.ok) {
    return {
      run: rejectedResult.run,
      message: { tone: "danger", text: rejectedResult.error.message },
    };
  }

  const canceledResult = transitionAgentRunStatus(rejectedResult.run, {
    status: "canceled",
    at: new Date().toISOString(),
    summary: "Patch proposal rejected by user.",
    finalSummary: "No editor changes were applied.",
  });
  return {
    run: canceledResult.run,
    message: canceledResult.ok
      ? { tone: "warning", text: "Patch rejected. The editor buffer was not changed." }
      : { tone: "danger", text: canceledResult.error.message },
  };
};

// ─── Hook ───────────────────────────────────────────────────────────────

export const useAgentPatchController = ({
  agentRun,
  setAgentRun,
  setAgentMessage,
  mode,
  file,
  workspace,
  source,
  onSourceChange,
}: AgentPatchControllerInput) => {
  useEffect(() => {
    setAgentRun(null);
    setAgentMessage(null);
  }, [file.id, mode, setAgentMessage, setAgentRun]);

  const proposeQuickFix = (candidate: QuickFixCandidate) => {
    if (mode !== "workspace" || file.kind !== "file") {
      setAgentMessage({
        tone: "warning",
        text: "Open a local workspace file before creating an Agent patch proposal.",
      });
      return;
    }

    const result = createAgentProposalRun(candidate, file, workspace.workspaceId);
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const approvePatch = () => {
    const result = agentRun ? approveAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  const applyPatch = () => {
    const operation = agentRun ? applyAgentRunPatch(agentRun, source) : null;
    if (!operation) return;
    if (operation.nextSource !== undefined) onSourceChange(operation.nextSource);
    setAgentRun(operation.result.run);
    setAgentMessage(operation.result.message);
  };

  const rejectPatch = () => {
    const result = agentRun ? rejectAgentRunPatch(agentRun) : null;
    if (!result) return;
    setAgentRun(result.run);
    setAgentMessage(result.message);
  };

  return { proposeQuickFix, approvePatch, applyPatch, rejectPatch };
};
