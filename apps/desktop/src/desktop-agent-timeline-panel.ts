import {
  canApplyApprovedPatch,
  hasUsableCitation,
  type AgentAuditEvent,
  type AgentEvidence,
  type AgentRun,
  type AgentRunStatus,
  type AgentToolCall,
  type AgentToolError,
  type PatchDecision,
  type PatchProposal
} from "@chemd/agent-tools";

export type DesktopAgentTimelinePanelState = AgentRunStatus | "empty";
export type DesktopAgentWarningSeverity = "info" | "warning" | "error";
export type DesktopAgentPatchGateStatus =
  | "idle"
  | "requires_approval"
  | "ready_to_apply"
  | "blocked"
  | "applied"
  | "rejected";

export interface DesktopAgentTimelinePanelOptions {
  currentBeforeHash?: string;
  maxSummaryLength?: number;
}

export interface DesktopAgentWarning {
  id: string;
  code: string;
  message: string;
  severity: DesktopAgentWarningSeverity;
  source: "run" | "timeline" | "tool_call" | "patch";
  sourceId?: string;
}

export interface DesktopAgentTimelineSummary {
  runId?: string;
  workspaceId?: string;
  goal: string;
  statusLabel: string;
  targetFiles: readonly string[];
  createdAt?: string;
  updatedAt?: string;
  finalSummary?: string;
  counts: {
    timelineRows: number;
    toolCalls: number;
    evidence: number;
    patchProposals: number;
    patchDecisions: number;
    warnings: number;
  };
}

export interface DesktopAgentTimelineRow {
  rowId: string;
  type: AgentAuditEvent["type"];
  label: string;
  message: string;
  at?: string;
  fromStatus?: AgentRunStatus;
  toStatus?: AgentRunStatus;
  toolCallId?: string;
  patchProposalId?: string;
  decisionId?: string;
  error?: AgentToolError;
}

export interface DesktopAgentToolCallRow {
  toolCallId: string;
  toolName: AgentToolCall["toolName"];
  status: AgentToolCall["status"];
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  inputSummary: string;
  outputSummary: string;
  evidenceCount: number;
  citationCount: number;
  error?: AgentToolError;
  warnings: readonly string[];
}

export interface DesktopAgentPatchDecisionRow {
  decisionId: string;
  kind: PatchDecision["kind"];
  decidedAt?: string;
  reason?: string;
  userApprovalId?: string;
}

export interface DesktopAgentPatchGate {
  status: DesktopAgentPatchGateStatus;
  message: string;
  errorCode?: string;
}

export interface DesktopAgentPatchRow {
  patchProposalId: string;
  documentId: string;
  baseRevisionId?: string;
  title: string;
  rationale: string;
  beforeHash: string;
  editCount: number;
  evidenceCount: number;
  citationCount: number;
  decisions: readonly DesktopAgentPatchDecisionRow[];
  gate: DesktopAgentPatchGate;
  warnings: readonly string[];
}

export interface DesktopAgentSafetySummary {
  citationGate: {
    status: "ok" | "warning";
    message: string;
  };
  patchGate: DesktopAgentPatchGate;
}

export interface DesktopAgentTimelinePanel {
  state: DesktopAgentTimelinePanelState;
  message: string;
  summary: DesktopAgentTimelineSummary;
  timelineRows: readonly DesktopAgentTimelineRow[];
  toolCallRows: readonly DesktopAgentToolCallRow[];
  patchRows: readonly DesktopAgentPatchRow[];
  warnings: readonly DesktopAgentWarning[];
  safety: DesktopAgentSafetySummary;
}

const STATUS_LABELS: Record<DesktopAgentTimelinePanelState, string> = {
  empty: "No agent run",
  created: "Created",
  running: "Running",
  waiting_for_approval: "Awaiting approval",
  applying_patch: "Applying patch",
  validating: "Validating",
  completed: "Completed",
  failed: "Failed",
  blocked: "Blocked",
  canceled: "Canceled"
};

const EVENT_LABELS: Record<AgentAuditEvent["type"], string> = {
  run_created: "Run",
  status_transitioned: "Status",
  tool_call_appended: "Tool",
  evidence_attached: "Evidence",
  patch_proposed: "Patch",
  patch_approved: "Approve",
  patch_rejected: "Reject",
  patch_applied: "Apply",
  decision_blocked: "Blocked"
};

const DEFAULT_MAX_SUMMARY_LENGTH = 96;

export const buildDesktopAgentTimelinePanel = (
  run: AgentRun | null,
  options: DesktopAgentTimelinePanelOptions = {}
): DesktopAgentTimelinePanel => {
  if (run === null) return buildEmptyPanel();

  const maxLength = options.maxSummaryLength ?? DEFAULT_MAX_SUMMARY_LENGTH;
  const timelineRows = buildTimelineRows(run);
  const toolCallRows = run.toolCalls.map((toolCall) => buildToolCallRow(toolCall, maxLength));
  const patchRows = run.patchProposals.map((proposal) =>
    buildPatchRow(run.patchDecisions, proposal, options)
  );
  const warnings = buildWarnings(run, toolCallRows, patchRows);
  const safety = buildSafetySummary(warnings, patchRows);

  return {
    state: run.status,
    message: buildRunMessage(run, safety),
    summary: buildSummary(run, timelineRows.length, warnings.length),
    timelineRows,
    toolCallRows,
    patchRows,
    warnings,
    safety
  };
};

const buildEmptyPanel = (): DesktopAgentTimelinePanel => ({
  state: "empty",
  message: "No agent run has started. Start from a quick fix proposal to see the audit trail.",
  summary: {
    goal: "No active agent run",
    statusLabel: STATUS_LABELS.empty,
    targetFiles: [],
    counts: {
      timelineRows: 0,
      toolCalls: 0,
      evidence: 0,
      patchProposals: 0,
      patchDecisions: 0,
      warnings: 0
    }
  },
  timelineRows: [],
  toolCallRows: [],
  patchRows: [],
  warnings: [],
  safety: {
    citationGate: {
      status: "ok",
      message: "No RAG evidence is attached."
    },
    patchGate: {
      status: "idle",
      message: "No patch proposal is waiting for review."
    }
  }
});

const buildTimelineRows = (run: AgentRun): readonly DesktopAgentTimelineRow[] => {
  if (run.auditTimeline.length === 0) {
    return [{
      rowId: `${run.agentRunId}:timeline:fallback`,
      type: "status_transitioned",
      label: "Status",
      message: `No audit events recorded. Current status is ${STATUS_LABELS[run.status]}.`,
      at: run.updatedAt,
      toStatus: run.status
    }];
  }

  return run.auditTimeline.map((event) => ({
    rowId: event.eventId,
    type: event.type,
    label: EVENT_LABELS[event.type],
    message: event.summary,
    at: event.at,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    toolCallId: event.toolCallId,
    patchProposalId: event.patchProposalId,
    decisionId: event.decisionId,
    error: event.error
  }));
};

const buildToolCallRow = (
  toolCall: AgentToolCall,
  maxLength: number
): DesktopAgentToolCallRow => {
  const result = toolCall.result;
  const evidence = result?.evidence ?? [];
  const error = result?.error;

  return {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    status: result?.status ?? toolCall.status,
    startedAt: toolCall.startedAt,
    finishedAt: toolCall.finishedAt,
    durationMs: calculateDurationMs(toolCall.startedAt, toolCall.finishedAt),
    inputSummary: summarizeValue(toolCall.payload, maxLength),
    outputSummary: summarizeToolResult(result, maxLength),
    evidenceCount: evidence.length,
    citationCount: countCitations(evidence),
    error,
    warnings: buildEvidenceWarningCodes(evidence)
  };
};

const buildPatchRow = (
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

const buildWarnings = (
  run: AgentRun,
  toolRows: readonly DesktopAgentToolCallRow[],
  patchRows: readonly DesktopAgentPatchRow[]
): readonly DesktopAgentWarning[] => [
  ...buildEvidenceWarnings("run", run.agentRunId, run.evidence),
  ...toolRows.flatMap(buildToolWarnings),
  ...patchRows.flatMap(buildPatchWarnings),
  ...run.auditTimeline.flatMap(buildAuditWarnings)
];

const buildToolWarnings = (row: DesktopAgentToolCallRow): readonly DesktopAgentWarning[] => {
  const errorWarning = row.error === undefined ? [] : [buildWarning({
    code: row.error.code,
    message: row.error.message,
    severity: "error",
    source: "tool_call",
    sourceId: row.toolCallId
  })];

  return [
    ...errorWarning,
    ...row.warnings.map((code) => buildWarning({
      code,
      message: "Tool call produced RAG evidence without a usable citation.",
      severity: "warning",
      source: "tool_call",
      sourceId: row.toolCallId
    }))
  ];
};

const buildPatchWarnings = (row: DesktopAgentPatchRow): readonly DesktopAgentWarning[] => [
  ...row.warnings.map((code) => buildWarning({
    code,
    message: "Patch proposal evidence is missing a usable citation.",
    severity: "warning",
    source: "patch",
    sourceId: row.patchProposalId
  })),
  ...(row.gate.status === "blocked" ? [buildWarning({
    code: row.gate.errorCode ?? "patch_gate_blocked",
    message: row.gate.message,
    severity: "error",
    source: "patch",
    sourceId: row.patchProposalId
  })] : [])
];

const buildAuditWarnings = (event: AgentAuditEvent): readonly DesktopAgentWarning[] =>
  event.error === undefined ? [] : [buildWarning({
    code: event.error.code,
    message: event.error.message,
    severity: "error",
    source: "timeline",
    sourceId: event.eventId
  })];

const buildEvidenceWarnings = (
  source: DesktopAgentWarning["source"],
  sourceId: string,
  evidence: readonly AgentEvidence[]
): readonly DesktopAgentWarning[] =>
  evidence.filter(isUncitedRagEvidence).map((item) => buildWarning({
    code: "rag_evidence_missing_citation",
    message: `RAG evidence requires a usable citation: ${item.summary}`,
    severity: "warning",
    source,
    sourceId
  }));

const buildSafetySummary = (
  warnings: readonly DesktopAgentWarning[],
  patches: readonly DesktopAgentPatchRow[]
): DesktopAgentSafetySummary => ({
  citationGate: {
    status: warnings.some((warning) => warning.code === "rag_evidence_missing_citation")
      ? "warning"
      : "ok",
    message: warnings.some((warning) => warning.code === "rag_evidence_missing_citation")
      ? "Some RAG evidence is missing usable citations."
      : "All attached RAG evidence has usable citations."
  },
  patchGate: selectPatchGate(patches)
});

const selectPatchGate = (patches: readonly DesktopAgentPatchRow[]): DesktopAgentPatchGate => {
  const latest = patches[patches.length - 1];
  if (latest === undefined) {
    return { status: "idle", message: "No patch proposal is waiting for review." };
  }

  return latest.gate;
};

const buildSummary = (
  run: AgentRun,
  timelineRows: number,
  warnings: number
): DesktopAgentTimelineSummary => ({
  runId: run.agentRunId,
  workspaceId: run.workspaceId,
  goal: run.goal,
  statusLabel: STATUS_LABELS[run.status],
  targetFiles: run.targetFiles,
  createdAt: run.createdAt,
  updatedAt: run.updatedAt,
  finalSummary: run.finalSummary,
  counts: {
    timelineRows,
    toolCalls: run.toolCalls.length,
    evidence: run.evidence.length,
    patchProposals: run.patchProposals.length,
    patchDecisions: run.patchDecisions.length,
    warnings
  }
});

const buildRunMessage = (run: AgentRun, safety: DesktopAgentSafetySummary): string => {
  if (run.finalSummary !== undefined && run.finalSummary.trim().length > 0) {
    return run.finalSummary;
  }

  if (safety.patchGate.status === "blocked") return safety.patchGate.message;
  if (safety.citationGate.status === "warning") return safety.citationGate.message;
  return `${STATUS_LABELS[run.status]}: ${run.goal}`;
};

const summarizeToolResult = (
  result: AgentToolCall["result"],
  maxLength: number
): string => {
  if (result === undefined) return "No output yet.";
  if (result.error !== undefined) {
    return truncate(`${result.error.code}: ${result.error.message}`, maxLength);
  }

  return summarizeValue(result.payload, maxLength);
};

const summarizeValue = (value: unknown, maxLength: number): string => {
  if (value === undefined) return "none";
  if (value === null) return "null";
  if (typeof value === "string") return truncate(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return truncate(`array(${value.length})`, maxLength);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return summarizeObject(value, maxLength);
  return typeof value;
};

const summarizeObject = (value: object, maxLength: number): string => {
  const entries = Object.entries(value)
    .filter((entry) => isSummarizableValue(entry[1]))
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${summarizeNestedValue(item)}`);

  return entries.length === 0 ? "object" : truncate(entries.join(", "), maxLength);
};

const summarizeNestedValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object";
  if (value === undefined) return "none";
  return String(value);
};

const isSummarizableValue = (value: unknown): boolean =>
  value !== undefined && typeof value !== "function";

const buildEvidenceWarningCodes = (
  evidence: readonly AgentEvidence[]
): readonly string[] =>
  evidence.some(isUncitedRagEvidence)
    ? ["rag_evidence_missing_citation"]
    : [];

const isUncitedRagEvidence = (evidence: AgentEvidence): boolean =>
  evidence.kind === "rag" && !hasUsableCitation(evidence);

const countCitations = (evidence: readonly AgentEvidence[]): number =>
  evidence.filter(hasUsableCitation).length;

const calculateDurationMs = (startedAt?: string, finishedAt?: string): number | undefined => {
  if (startedAt === undefined || finishedAt === undefined) return undefined;

  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  return Number.isNaN(started) || Number.isNaN(finished) ? undefined : finished - started;
};

const hasDecision = (
  decisions: readonly PatchDecision[],
  kind: PatchDecision["kind"]
): boolean => decisions.some((decision) => decision.kind === kind);

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`;

const buildWarning = (
  input: Omit<DesktopAgentWarning, "id">
): DesktopAgentWarning => ({
  ...input,
  id: `${input.source}:${input.sourceId ?? "run"}:${input.code}`
});
