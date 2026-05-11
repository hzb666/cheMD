export const AGENT_TOOL_NAMES = [
  "compile_current_file",
  "validate_workspace",
  "query_rag",
  "inspect_reaction_graph",
  "semantic_diff",
  "propose_repair",
  "apply_approved_patch"
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type AgentEvidenceKind =
  | "source"
  | "diagnostic"
  | "rag"
  | "graph"
  | "revision"
  | "tool-output";

export type AgentRunStatus =
  | "created"
  | "running"
  | "waiting_for_approval"
  | "applying_patch"
  | "validating"
  | "completed"
  | "failed"
  | "blocked"
  | "canceled";

export type AgentToolCallStatus = "ok" | "failed" | "blocked";

export type PatchDecisionKind = "approved" | "rejected" | "applied";

export type AgentAuditEventType =
  | "run_created"
  | "status_transitioned"
  | "tool_call_appended"
  | "evidence_attached"
  | "patch_proposed"
  | "patch_approved"
  | "patch_rejected"
  | "patch_applied"
  | "decision_blocked";

export interface ChemdSourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface ChemdTextEdit {
  range: ChemdSourceRange;
  replacement: string;
}

export interface AgentCitation {
  citationId: string;
  sourceLabel: string;
  documentId?: string;
  revisionId?: string;
  filePath?: string;
  blockId?: string;
  sourceRange?: ChemdSourceRange;
  uri?: string;
}

export interface AgentEvidence {
  kind: AgentEvidenceKind;
  documentId?: string;
  revisionId?: string;
  filePath?: string;
  entityId?: string;
  blockId?: string;
  sourceRange?: ChemdSourceRange;
  summary: string;
  citation?: AgentCitation;
}

export interface AgentToolError {
  code: string;
  message: string;
}

export interface AgentToolCall<TPayload = unknown, TResult = unknown> {
  toolCallId: string;
  agentRunId: string;
  workspaceId: string;
  toolName: AgentToolName;
  payload: TPayload;
  status: AgentToolCallStatus;
  result?: AgentToolResult<TResult>;
  startedAt?: string;
  finishedAt?: string;
}

export interface AgentToolResult<TPayload = unknown> {
  toolCallId: string;
  status: AgentToolCallStatus;
  payload?: TPayload;
  error?: AgentToolError;
  evidence: readonly AgentEvidence[];
}

export interface PatchProposal {
  patchProposalId: string;
  documentId: string;
  baseRevisionId?: string;
  beforeHash: string;
  title: string;
  rationale: string;
  edits: readonly ChemdTextEdit[];
  evidence: readonly AgentEvidence[];
}

export interface PatchDecision {
  decisionId: string;
  patchProposalId: string;
  kind: PatchDecisionKind;
  userApprovalId?: string;
  reason?: string;
  decidedAt?: string;
}

export interface AgentAuditEvent {
  eventId: string;
  agentRunId: string;
  type: AgentAuditEventType;
  summary: string;
  at?: string;
  fromStatus?: AgentRunStatus;
  toStatus?: AgentRunStatus;
  toolCallId?: string;
  patchProposalId?: string;
  decisionId?: string;
  evidenceIndexes?: readonly number[];
  error?: AgentToolError;
}

export interface AgentRun {
  agentRunId: string;
  workspaceId: string;
  goal: string;
  targetFiles: readonly string[];
  status: AgentRunStatus;
  toolCalls: readonly AgentToolCall[];
  evidence: readonly AgentEvidence[];
  patchProposals: readonly PatchProposal[];
  patchDecisions: readonly PatchDecision[];
  auditTimeline: readonly AgentAuditEvent[];
  validationResult?: AgentToolResult;
  finalSummary?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateToolResultInput<TPayload> {
  toolCallId: string;
  status: AgentToolCallStatus;
  payload?: TPayload;
  error?: AgentToolError;
  evidence?: readonly AgentEvidence[];
}

export type AgentSafetyGateResult =
  | {
      allowed: true;
    }
  | {
      allowed: false;
      error: AgentToolError;
    };

export type AgentRunMutationResult =
  | {
      ok: true;
      run: AgentRun;
    }
  | {
      ok: false;
      run: AgentRun;
      error: AgentToolError;
    };

export interface ApplyApprovedPatchGateInput {
  patchProposal: PatchProposal;
  userApprovalId?: string | null;
  currentBeforeHash?: string;
}

export interface CreateAgentRunInput {
  agentRunId: string;
  workspaceId: string;
  goal: string;
  targetFiles?: readonly string[];
  createdAt?: string;
}

export interface TransitionAgentRunInput {
  status: AgentRunStatus;
  at?: string;
  summary?: string;
  finalSummary?: string;
  validationResult?: AgentToolResult;
}

export interface AppendToolCallInput {
  toolCall: AgentToolCall;
  at?: string;
  summary?: string;
}

export interface AttachEvidenceInput {
  evidence: readonly AgentEvidence[];
  at?: string;
  summary?: string;
}

export interface ProposePatchInput {
  patchProposal: PatchProposal;
  at?: string;
  summary?: string;
}

export interface PatchDecisionInput {
  decisionId: string;
  patchProposalId: string;
  userApprovalId?: string;
  reason?: string;
  decidedAt?: string;
}

export interface ApplyPatchDecisionInput extends PatchDecisionInput {
  currentBeforeHash?: string;
}
