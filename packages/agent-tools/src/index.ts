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

export interface AgentRun {
  agentRunId: string;
  workspaceId: string;
  goal: string;
  targetFiles: readonly string[];
  status: AgentRunStatus;
  toolCalls: readonly AgentToolCall[];
  evidence: readonly AgentEvidence[];
  patchProposals: readonly PatchProposal[];
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

export interface ApplyApprovedPatchGateInput {
  patchProposal: PatchProposal;
  userApprovalId?: string | null;
  currentBeforeHash?: string;
}

export const createToolResult = <TPayload>(
  input: CreateToolResultInput<TPayload>
): AgentToolResult<TPayload> => ({
  toolCallId: input.toolCallId,
  status: input.status,
  ...(input.payload === undefined ? {} : { payload: input.payload }),
  ...(input.error === undefined ? {} : { error: input.error }),
  evidence: input.evidence ?? []
});

export const requireCitedEvidence = (
  evidence: readonly AgentEvidence[]
): AgentSafetyGateResult => {
  const uncitedRagEvidence = evidence.find((item) => item.kind === "rag" && !hasUsableCitation(item));

  if (uncitedRagEvidence === undefined) {
    return allow();
  }

  return block(
    "rag_evidence_missing_citation",
    `RAG evidence requires a usable citation: ${uncitedRagEvidence.summary}`
  );
};

export const validatePatchProposalBaseHash = (
  proposal: PatchProposal,
  currentBeforeHash?: string
): AgentSafetyGateResult => {
  if (!isNonBlankString(proposal.beforeHash)) {
    return block("patch_base_hash_missing", "Patch proposal requires a non-empty beforeHash");
  }

  if (currentBeforeHash !== undefined && proposal.beforeHash !== currentBeforeHash) {
    return block("patch_base_hash_mismatch", "Patch proposal beforeHash does not match current content");
  }

  return allow();
};

export const validatePatchProposalEvidence = (
  proposal: PatchProposal
): AgentSafetyGateResult => requireCitedEvidence(proposal.evidence);

export const canApplyApprovedPatch = (
  input: ApplyApprovedPatchGateInput
): AgentSafetyGateResult => {
  if (!isNonBlankString(input.userApprovalId)) {
    return block("approval_id_missing", "Applying a patch requires a userApprovalId");
  }

  const baseHashResult = validatePatchProposalBaseHash(
    input.patchProposal,
    input.currentBeforeHash
  );

  if (!baseHashResult.allowed) {
    return baseHashResult;
  }

  return validatePatchProposalEvidence(input.patchProposal);
};

const allow = (): AgentSafetyGateResult => ({ allowed: true });

const block = (code: string, message: string): AgentSafetyGateResult => ({
  allowed: false,
  error: {
    code,
    message
  }
});

const hasUsableCitation = (evidence: AgentEvidence): boolean => {
  const citation = evidence.citation;

  if (citation === undefined) {
    return false;
  }

  return isNonBlankString(citation.citationId) &&
    isNonBlankString(citation.sourceLabel) &&
    hasCitationLocator(citation);
};

const hasCitationLocator = (citation: AgentCitation): boolean =>
  [
    citation.documentId,
    citation.revisionId,
    citation.filePath,
    citation.blockId,
    citation.uri
  ].some(isNonBlankString);

const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
