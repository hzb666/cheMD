import {
  type AgentAuditEvent,
  type AgentEvidence,
  type AgentRun,
  type AgentToolCall
} from "@chemd/agent-tools";

import {
  AGENT_TOOL_NAMES,
  summarizeAgentToolInput as summarizeAgentToolContractInput,
  summarizeAgentToolOutput as summarizeAgentToolContractOutput,
  type OrchestratedToolName
} from "../agent-tools";
import {
  buildEvidenceWarningCodes,
  calculateDurationMs,
  countCitations,
  isUncitedRagEvidence,
  summarizeToolResult,
  summarizeValue
} from "./timeline-panel-format";
import {
  buildPatchRow,
  selectPatchGate
} from "./timeline-panel-patches";
import {
  EVENT_LABELS,
  STATUS_LABELS,
  type AgentPatchRow,
  type AgentSafetySummary,
  type AgentTimelinePanel,
  type AgentTimelinePanelOptions,
  type AgentTimelineRow,
  type AgentTimelineSummary,
  type AgentToolCallRow,
  type AgentWarning
} from "./timeline-panel-types";

export type {
  AgentPatchDecisionRow,
  AgentPatchGate,
  AgentPatchGateStatus,
  AgentPatchRow,
  AgentSafetySummary,
  AgentTimelinePanel,
  AgentTimelinePanelOptions,
  AgentTimelinePanelState,
  AgentTimelineRow,
  AgentTimelineSummary,
  AgentToolCallRow,
  AgentWarning,
  AgentWarningSeverity
} from "./timeline-panel-types";

const DEFAULT_MAX_SUMMARY_LENGTH = 96;
const desktopAgentToolNames = new Set<string>(AGENT_TOOL_NAMES);

export const buildAgentTimelinePanel = (
  run: AgentRun | null,
  options: AgentTimelinePanelOptions = {}
): AgentTimelinePanel => {
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

const buildEmptyPanel = (): AgentTimelinePanel => ({
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

const buildTimelineRows = (run: AgentRun): readonly AgentTimelineRow[] => {
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
): AgentToolCallRow => {
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
    inputSummary: summarizeToolCallInput(toolCall, maxLength),
    outputSummary: summarizeToolCallOutput(toolCall, maxLength),
    evidenceCount: evidence.length,
    citationCount: countCitations(evidence),
    error,
    warnings: buildEvidenceWarningCodes(evidence)
  };
};

const isOrchestratedToolName = (
  toolName: AgentToolCall["toolName"]
): toolName is OrchestratedToolName => desktopAgentToolNames.has(toolName);

const summarizeToolCallInput = (
  toolCall: AgentToolCall,
  maxLength: number
): string => {
  if (!isOrchestratedToolName(toolCall.toolName)) {
    return summarizeValue(toolCall.payload, maxLength);
  }
  const contractSummary = summarizeAgentToolContractInput(toolCall.toolName, toolCall.payload);
  return contractSummary === "No summary fields."
    ? summarizeValue(toolCall.payload, maxLength)
    : contractSummary;
};

const summarizeToolCallOutput = (
  toolCall: AgentToolCall,
  maxLength: number
): string => {
  if (!isOrchestratedToolName(toolCall.toolName)) {
    return summarizeToolResult(toolCall.result, maxLength);
  }
  if (toolCall.result?.error !== undefined) {
    return summarizeToolResult(toolCall.result, maxLength);
  }
  const contractSummary = summarizeAgentToolContractOutput(toolCall.toolName, toolCall.result?.payload);
  return contractSummary === "No summary fields."
    ? summarizeToolResult(toolCall.result, maxLength)
    : contractSummary;
};

const buildWarnings = (
  run: AgentRun,
  toolRows: readonly AgentToolCallRow[],
  patchRows: readonly AgentPatchRow[]
): readonly AgentWarning[] => [
  ...buildEvidenceWarnings("run", run.agentRunId, run.evidence),
  ...toolRows.flatMap(buildToolWarnings),
  ...patchRows.flatMap(buildPatchWarnings),
  ...run.auditTimeline.flatMap(buildAuditWarnings)
];

const buildToolWarnings = (row: AgentToolCallRow): readonly AgentWarning[] => {
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

const buildPatchWarnings = (row: AgentPatchRow): readonly AgentWarning[] => [
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

const buildAuditWarnings = (event: AgentAuditEvent): readonly AgentWarning[] =>
  event.error === undefined ? [] : [buildWarning({
    code: event.error.code,
    message: event.error.message,
    severity: "error",
    source: "timeline",
    sourceId: event.eventId
  })];

const buildEvidenceWarnings = (
  source: AgentWarning["source"],
  sourceId: string,
  evidence: readonly AgentEvidence[]
): readonly AgentWarning[] =>
  evidence.filter(isUncitedRagEvidence).map((item) => buildWarning({
    code: "rag_evidence_missing_citation",
    message: `RAG evidence requires a usable citation: ${item.summary}`,
    severity: "warning",
    source,
    sourceId
  }));

const buildSafetySummary = (
  warnings: readonly AgentWarning[],
  patches: readonly AgentPatchRow[]
): AgentSafetySummary => ({
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

const buildSummary = (
  run: AgentRun,
  timelineRows: number,
  warnings: number
): AgentTimelineSummary => ({
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

const buildRunMessage = (run: AgentRun, safety: AgentSafetySummary): string => {
  if (run.finalSummary !== undefined && run.finalSummary.trim().length > 0) {
    return run.finalSummary;
  }

  if (safety.patchGate.status === "blocked") return safety.patchGate.message;
  if (safety.citationGate.status === "warning") return safety.citationGate.message;
  return `${STATUS_LABELS[run.status]}: ${run.goal}`;
};

const buildWarning = (
  input: Omit<AgentWarning, "id">
): AgentWarning => ({
  ...input,
  id: `${input.source}:${input.sourceId ?? "run"}:${input.code}`
});
