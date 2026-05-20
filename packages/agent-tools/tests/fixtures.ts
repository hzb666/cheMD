import {
  createToolResult,
  type AgentEvidence,
  type AgentToolCall,
  type PatchProposal
} from "../src/index";

export const citedRagEvidence: AgentEvidence = {
  kind: "rag",
  summary: "Yield improved after lowering the reaction temperature.",
  citation: {
    citationId: "cite-rag-1",
    sourceLabel: "exp-001 result",
    documentId: "exp-001",
    revisionId: "rev-001"
  }
};

export const proposal: PatchProposal = {
  patchProposalId: "patch-1",
  documentId: "doc-1",
  beforeHash: "sha256:base",
  title: "Normalize reaction yield",
  rationale: "Aligns result yield with diagnostic guidance.",
  edits: [
    {
      range: {
        startLine: 5,
        startColumn: 1,
        endLine: 5,
        endColumn: 10
      },
      replacement: "yield: 80 %"
    }
  ],
  evidence: [citedRagEvidence]
};

export const toolCall: AgentToolCall = {
  toolCallId: "tool-1",
  agentRunId: "run-1",
  workspaceId: "workspace-1",
  toolName: "query_rag",
  payload: {
    query: "reaction yield"
  },
  status: "ok",
  result: createToolResult({
    toolCallId: "tool-1",
    status: "ok",
    payload: {
      hits: 1
    },
    evidence: [citedRagEvidence]
  })
};
