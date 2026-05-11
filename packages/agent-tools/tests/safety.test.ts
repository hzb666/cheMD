import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_NAMES,
  canApplyApprovedPatch,
  createToolResult,
  requireCitedEvidence,
  validatePatchProposalBaseHash,
  validatePatchProposalEvidence
} from "../src/index";
import { citedRagEvidence, proposal } from "./fixtures";

describe("@chemd/agent-tools contract", () => {
  it("exposes the allowed desktop agent tool names", () => {
    expect(AGENT_TOOL_NAMES).toEqual([
      "compile_current_file",
      "validate_workspace",
      "query_rag",
      "inspect_reaction_graph",
      "semantic_diff",
      "propose_repair",
      "apply_approved_patch"
    ]);
  });

  it("creates tool results with deterministic evidence defaults", () => {
    expect(createToolResult({ toolCallId: "tool-1", status: "ok", payload: { done: true } }))
      .toEqual({
        toolCallId: "tool-1",
        status: "ok",
        payload: { done: true },
        evidence: []
      });
  });
});

describe("agent tool safety gates", () => {
  it("rejects RAG evidence without citation", () => {
    const result = requireCitedEvidence([
      {
        kind: "rag",
        summary: "Uncited RAG claim"
      }
    ]);

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "rag_evidence_missing_citation"
      }
    });
  });

  it("accepts RAG evidence with a usable citation", () => {
    expect(requireCitedEvidence([citedRagEvidence])).toEqual({ allowed: true });
  });

  it("rejects patch proposal evidence with uncited RAG evidence", () => {
    const result = validatePatchProposalEvidence({
      ...proposal,
      evidence: [
        {
          kind: "rag",
          summary: "Uncited patch evidence"
        }
      ]
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "rag_evidence_missing_citation"
      }
    });
  });

  it("rejects patch proposals without a base hash", () => {
    const result = validatePatchProposalBaseHash({
      ...proposal,
      beforeHash: ""
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "patch_base_hash_missing"
      }
    });
  });

  it("rejects patch proposals when the current base hash changed", () => {
    const result = validatePatchProposalBaseHash(proposal, "sha256:other");

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "patch_base_hash_mismatch"
      }
    });
  });

  it("requires a user approval id before applying a patch", () => {
    const result = canApplyApprovedPatch({
      patchProposal: proposal
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "approval_id_missing"
      }
    });
  });

  it("blocks approved patches with uncited RAG evidence", () => {
    const result = canApplyApprovedPatch({
      patchProposal: {
        ...proposal,
        evidence: [
          {
            kind: "rag",
            summary: "Uncited patch evidence"
          }
        ]
      },
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "rag_evidence_missing_citation"
      }
    });
  });

  it("blocks approved patches without any evidence", () => {
    const result = canApplyApprovedPatch({
      patchProposal: {
        ...proposal,
        evidence: []
      },
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "patch_evidence_missing"
      }
    });
  });

  it("blocks approved patches with uncited non-RAG evidence", () => {
    const result = canApplyApprovedPatch({
      patchProposal: {
        ...proposal,
        evidence: [
          {
            kind: "graph",
            summary: "Graph neighbor suggests a related reaction."
          }
        ]
      },
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toMatchObject({
      allowed: false,
      error: {
        code: "patch_evidence_missing_citation"
      }
    });
  });

  it("allows approved patches with a matching base hash", () => {
    const result = canApplyApprovedPatch({
      patchProposal: proposal,
      userApprovalId: "approval-1",
      currentBeforeHash: "sha256:base"
    });

    expect(result).toEqual({ allowed: true });
  });
});
