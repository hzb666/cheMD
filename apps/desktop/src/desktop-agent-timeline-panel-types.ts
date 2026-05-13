import type {
  AgentAuditEvent,
  AgentRunStatus,
  AgentToolCall,
  AgentToolError,
  PatchDecision
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

export const STATUS_LABELS: Record<DesktopAgentTimelinePanelState, string> = {
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
