import type { SourceMappedNode } from "../ast";
import type { ChemdDeclarationBase } from "./declarations";
import type { ChemdDocCommentRef } from "./docs";
import type {
  ChemdPatchTarget,
  ChemdReferenceExpr,
  ChemdValue
} from "./values";

export interface AgentRunDeclaration extends ChemdDeclarationBase {
  kind: "agent_run";
  goal: string;
  status: AgentRunStatus;
  targetFiles?: string[];
  toolCalls: AgentToolCallDeclaration[];
  evidence: AgentEvidenceDeclaration[];
  patches: AgentPatchProposalDeclaration[];
  decisions: AgentPatchDecisionDeclaration[];
  auditTimeline: AgentAuditEventDeclaration[];
}

export type AgentRunStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export interface AgentToolCallDeclaration extends SourceMappedNode {
  kind: "tool";
  id: string;
  name: string;
  status: AgentToolCallStatus;
  args?: Record<string, ChemdValue>;
  evidence?: ChemdReferenceExpr[];
  output?: ChemdValue;
  docs?: ChemdDocCommentRef[];
}

export type AgentToolCallStatus =
  | "pending"
  | "running"
  | "ok"
  | "error"
  | "skipped";

export interface AgentEvidenceDeclaration extends SourceMappedNode {
  kind: "evidence";
  id: string;
  evidenceKind: AgentEvidenceKind;
  refs?: ChemdReferenceExpr[];
  uri?: string;
  description?: string;
  checksum?: string;
  confidence?: number;
}

export type AgentEvidenceKind =
  | "source"
  | "compile"
  | "test"
  | "runtime"
  | "document"
  | "external";

export interface AgentPatchProposalDeclaration extends SourceMappedNode {
  kind: "patch";
  id: string;
  status: AgentPatchProposalStatus;
  title?: string;
  rationale?: string;
  edits: AgentPatchEditDeclaration[];
  evidence?: ChemdReferenceExpr[];
  docs?: ChemdDocCommentRef[];
}

export type AgentPatchProposalStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "applied"
  | "superseded";

export interface AgentPatchEditDeclaration extends SourceMappedNode {
  target: ChemdPatchTarget;
  value: ChemdValue;
}

export interface AgentPatchDecisionDeclaration extends SourceMappedNode {
  kind: "decision";
  id: string;
  decision: AgentPatchDecision;
  patchId?: string;
  rationale?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export type AgentPatchDecision =
  | "approved"
  | "rejected"
  | "needs_changes"
  | "deferred"
  | "superseded";

export interface AgentAuditEventDeclaration extends SourceMappedNode {
  kind: "timeline_event";
  id: string;
  event: AgentAuditEventKind;
  at?: string;
  actor?: string;
  summary?: string;
  relatedToolCallId?: string;
  relatedPatchId?: string;
  evidence?: ChemdReferenceExpr[];
}

export type AgentAuditEventKind =
  | "created"
  | "started"
  | "tool_called"
  | "evidence_recorded"
  | "patch_proposed"
  | "decision_recorded"
  | "completed"
  | "failed"
  | "cancelled";
