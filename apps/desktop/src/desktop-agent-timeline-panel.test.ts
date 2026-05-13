import { describe, expect, it } from "vitest";

import type { AgentEvidence, AgentRun } from "@chemd/agent-tools";

import { buildDesktopAgentTimelinePanel } from "./desktop-agent-timeline-panel";

const citedEvidence: AgentEvidence = {
  kind: "rag",
  summary: "Yield optimization record from the local knowledge base.",
  citation: {
    citationId: "citation-1",
    sourceLabel: "experiment.chemd.md",
    filePath: "experiments/experiment.chemd.md"
  }
};

const uncitedEvidence: AgentEvidence = {
  kind: "rag",
  summary: "Uncited RAG claim about yield optimization."
};

const baseRun = (overrides: Partial<AgentRun> = {}): AgentRun => ({
  agentRunId: "run-1",
  workspaceId: "workspace-1",
  goal: "Prepare a safe desktop patch",
  targetFiles: ["experiments/experiment.chemd.md"],
  status: "running",
  toolCalls: [],
  evidence: [],
  patchProposals: [],
  patchDecisions: [],
  auditTimeline: [],
  createdAt: "2026-05-12T01:00:00.000Z",
  updatedAt: "2026-05-12T01:01:00.000Z",
  ...overrides
});

describe("buildDesktopAgentTimelinePanel", () => {
  it("returns an explainable empty fallback", () => {
    const panel = buildDesktopAgentTimelinePanel(null);

    expect(panel.state).toBe("empty");
    expect(panel.message).toContain("No agent run");
    expect(panel.summary.counts).toMatchObject({
      timelineRows: 0,
      toolCalls: 0,
      patchProposals: 0,
      warnings: 0
    });
    expect(panel.timelineRows).toEqual([]);
  });

  it("builds running timeline and tool call summaries", () => {
    const panel = buildDesktopAgentTimelinePanel(baseRun({
      auditTimeline: [{
        eventId: "event-1",
        agentRunId: "run-1",
        type: "tool_call_appended",
        summary: "Query RAG for related evidence.",
        at: "2026-05-12T01:00:02.000Z",
        toolCallId: "tool-1"
      }],
      toolCalls: [{
        toolCallId: "tool-1",
        agentRunId: "run-1",
        workspaceId: "workspace-1",
        toolName: "query_rag",
        payload: { query: "yield optimization", limit: 3 },
        status: "ok",
        result: {
          toolCallId: "tool-1",
          status: "ok",
          payload: { matches: 2 },
          evidence: [citedEvidence]
        },
        startedAt: "2026-05-12T01:00:00.000Z",
        finishedAt: "2026-05-12T01:00:02.500Z"
      }]
    }));

    expect(panel.state).toBe("running");
    expect(panel.timelineRows[0]).toMatchObject({
      rowId: "event-1",
      label: "Tool",
      message: "Query RAG for related evidence."
    });
    expect(panel.toolCallRows[0]).toMatchObject({
      toolCallId: "tool-1",
      toolName: "query_rag",
      inputSummary: "query: yield optimization, limit: 3",
      outputSummary: "matches: 2",
      durationMs: 2500,
      citationCount: 1
    });
  });

  it("maps patch decisions and patch apply gate state", () => {
    const panel = buildDesktopAgentTimelinePanel(baseRun({
      status: "waiting_for_approval",
      patchProposals: [{
        patchProposalId: "patch-1",
        documentId: "doc-1",
        beforeHash: "hash-before",
        title: "Add missing result note",
        rationale: "The local compiler found a missing result note.",
        edits: [{
          range: { startLine: 10, startColumn: 1, endLine: 10, endColumn: 1 },
          replacement: "note: fixed\n"
        }],
        evidence: [citedEvidence]
      }],
      patchDecisions: [{
        decisionId: "decision-1",
        patchProposalId: "patch-1",
        kind: "approved",
        userApprovalId: "approval-1",
        reason: "User approved the preview.",
        decidedAt: "2026-05-12T01:03:00.000Z"
      }]
    }), { currentBeforeHash: "hash-before" });

    expect(panel.patchRows[0]).toMatchObject({
      patchProposalId: "patch-1",
      title: "Add missing result note",
      editCount: 1,
      gate: {
        status: "ready_to_apply",
        message: "Patch is approved and passed safety checks."
      }
    });
    expect(panel.safety.patchGate.status).toBe("ready_to_apply");
  });

  it("warns when RAG evidence has no citation", () => {
    const panel = buildDesktopAgentTimelinePanel(baseRun({
      evidence: [uncitedEvidence],
      toolCalls: [{
        toolCallId: "tool-uncited",
        agentRunId: "run-1",
        workspaceId: "workspace-1",
        toolName: "query_rag",
        payload: { query: "uncited" },
        status: "ok",
        result: {
          toolCallId: "tool-uncited",
          status: "ok",
          evidence: [uncitedEvidence]
        }
      }]
    }));

    expect(panel.safety.citationGate.status).toBe("warning");
    expect(panel.warnings.map((warning) => warning.code))
      .toContain("rag_evidence_missing_citation");
    expect(panel.toolCallRows[0].warnings).toContain("rag_evidence_missing_citation");
  });

  it("surfaces failed tool call output and error", () => {
    const panel = buildDesktopAgentTimelinePanel(baseRun({
      status: "failed",
      toolCalls: [{
        toolCallId: "tool-failed",
        agentRunId: "run-1",
        workspaceId: "workspace-1",
        toolName: "compile_current_file",
        payload: { filePath: "experiments/broken.chemd.md" },
        status: "failed",
        result: {
          toolCallId: "tool-failed",
          status: "failed",
          error: {
            code: "compile_failed",
            message: "Compiler diagnostics blocked accepted revision."
          },
          evidence: []
        }
      }]
    }));

    expect(panel.state).toBe("failed");
    expect(panel.toolCallRows[0]).toMatchObject({
      status: "failed",
      outputSummary: "compile_failed: Compiler diagnostics blocked accepted revision.",
      error: {
        code: "compile_failed",
        message: "Compiler diagnostics blocked accepted revision."
      }
    });
    expect(panel.warnings.map((warning) => warning.code)).toContain("compile_failed");
  });
});
