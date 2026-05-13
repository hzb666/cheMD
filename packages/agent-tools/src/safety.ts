import type {
  AgentCitation,
  AgentEvidence,
  AgentSafetyGateResult,
  AgentToolError,
  AgentToolResult,
  ApplyApprovedPatchGateInput,
  CreateToolResultInput,
  PatchProposal
} from "./types";

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
  const uncitedRagEvidence = evidence.find(
    (item) => item.kind === "rag" && !hasUsableCitation(item)
  );

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
): AgentSafetyGateResult => {
  if (proposal.evidence.length === 0) {
    return block("patch_evidence_missing", "Patch proposal requires evidence before apply");
  }

  const ragCitationResult = requireCitedEvidence(proposal.evidence);
  if (!ragCitationResult.allowed) {
    return ragCitationResult;
  }

  const uncitedEvidence = proposal.evidence.find((item) => !hasUsableCitation(item));
  if (uncitedEvidence !== undefined) {
    return block(
      "patch_evidence_missing_citation",
      `Patch evidence requires a usable citation: ${uncitedEvidence.summary}`
    );
  }

  return allow();
};

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

export const allow = (): AgentSafetyGateResult => ({ allowed: true });

export const block = (code: string, message: string): AgentSafetyGateResult => ({
  allowed: false,
  error: {
    code,
    message
  }
});

export const hasUsableCitation = (evidence: AgentEvidence): boolean => {
  const citation = evidence.citation;

  if (citation === undefined) {
    return false;
  }

  return isNonBlankString(citation.citationId) &&
    isNonBlankString(citation.sourceLabel) &&
    hasCitationLocator(citation);
};

export const isNonBlankString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const toToolError = (code: string, message: string): AgentToolError => ({
  code,
  message
});

const hasCitationLocator = (citation: AgentCitation): boolean =>
  [
    citation.documentId,
    citation.revisionId,
    citation.filePath,
    citation.blockId,
    citation.uri
  ].some(isNonBlankString);
