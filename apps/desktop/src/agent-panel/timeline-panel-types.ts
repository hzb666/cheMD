import type {
  AgentAuditEvent,
  AgentRunStatus,
  AgentToolCall,
  AgentToolError,
  PatchDecision
} from "@chemd/agent-tools";

export type AgentTimelinePanelState = AgentRunStatus | "empty";
export type AgentWarningSeverity = "info" | "warning" | "error";
export type AgentPatchGateStatus =
  | "idle"
  | "requires_approval"
  | "ready_to_apply"
  | "blocked"
  | "applied"
  | "rejected";

export interface AgentTimelinePanelOptions {
  currentBeforeHash?: string;
  maxSummaryLength?: number;
}

export interface AgentWarning {
  id: string;
  code: string;
  message: string;
  severity: AgentWarningSeverity;
  source: "run" | "timeline" | "tool_call" | "patch";
  sourceId?: string;
}

export interface AgentTimelineSummary {
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

export interface AgentTimelineRow {
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

export interface AgentToolCallRow {
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

export interface AgentPatchDecisionRow {
  decisionId: string;
  kind: PatchDecision["kind"];
  decidedAt?: string;
  reason?: string;
  userApprovalId?: string;
}

export interface AgentPatchGate {
  status: AgentPatchGateStatus;
  message: string;
  errorCode?: string;
}

export interface AgentPatchRow {
  patchProposalId: string;
  documentId: string;
  baseRevisionId?: string;
  title: string;
  rationale: string;
  beforeHash: string;
  editCount: number;
  evidenceCount: number;
  citationCount: number;
  decisions: readonly AgentPatchDecisionRow[];
  gate: AgentPatchGate;
  warnings: readonly string[];
}

export interface AgentSafetySummary {
  citationGate: {
    status: "ok" | "warning";
    message: string;
  };
  patchGate: AgentPatchGate;
}

export interface AgentTimelinePanel {
  state: AgentTimelinePanelState;
  message: string;
  summary: AgentTimelineSummary;
  timelineRows: readonly AgentTimelineRow[];
  toolCallRows: readonly AgentToolCallRow[];
  patchRows: readonly AgentPatchRow[];
  warnings: readonly AgentWarning[];
  safety: AgentSafetySummary;
}

export const STATUS_LABELS: Record<AgentTimelinePanelState, string> = {
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

export const EVENT_LABELS: Record<AgentAuditEvent["type"], string> = {
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
