import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentTimelinePanel } from "./timeline-panel";
import { AgentPanel, canApply, canApprove, canReject } from "./agent-panel";

const basePanel = (overrides: Partial<AgentTimelinePanel> = {}): AgentTimelinePanel => ({
  state: "running",
  message: "Running: Prepare a safe desktop patch",
  summary: {
    runId: "run-1",
    workspaceId: "workspace-1",
    goal: "Prepare a safe desktop patch",
    statusLabel: "Running",
    targetFiles: ["experiments/experiment.chemd.md"],
    counts: {
      timelineRows: 1,
      toolCalls: 1,
      evidence: 1,
      patchProposals: 1,
      patchDecisions: 0,
      warnings: 1
    }
  },
  timelineRows: [{
    rowId: "event-1",
    type: "tool_call_appended",
    label: "Tool",
    message: "Query RAG for related evidence.",
    at: "2026-05-12T01:00:02.000Z",
    toolCallId: "tool-1"
  }],
  toolCallRows: [{
    toolCallId: "tool-1",
    toolName: "query_rag",
    status: "ok",
    startedAt: "2026-05-12T01:00:00.000Z",
    finishedAt: "2026-05-12T01:00:02.500Z",
    durationMs: 2500,
    inputSummary: "query: yield optimization",
    outputSummary: "matches: 2",
    evidenceCount: 1,
    citationCount: 1,
    warnings: []
  }],
  patchRows: [{
    patchProposalId: "patch-1",
    documentId: "doc-1",
    title: "Add missing result note",
    rationale: "The compiler found a missing result note.",
    beforeHash: "hash-before",
    editCount: 1,
    evidenceCount: 1,
    citationCount: 1,
    decisions: [],
    gate: {
      status: "requires_approval",
      message: "Patch requires explicit user approval."
    },
    warnings: []
  }],
  warnings: [{
    id: "run:run-1:rag_evidence_missing_citation",
    code: "rag_evidence_missing_citation",
    message: "RAG evidence requires a usable citation.",
    severity: "warning",
    source: "run",
    sourceId: "run-1"
  }],
  safety: {
    citationGate: {
      status: "warning",
      message: "Some RAG evidence is missing usable citations."
    },
    patchGate: {
      status: "requires_approval",
      message: "Patch requires explicit user approval."
    }
  },
  ...overrides
});

describe("AgentPanel", () => {
  it("renders summary, tool calls, patch gate, warnings, and timeline rows", () => {
    const html = renderToStaticMarkup(<AgentPanel panel={basePanel()} />);

    expect(html).toContain("Prepare a safe desktop patch");
    expect(html).toContain("query_rag");
    expect(html).toContain("Patch requires explicit user approval.");
    expect(html).toContain("rag_evidence_missing_citation");
    expect(html).toContain("Query RAG for related evidence.");
  });

  it("keeps patch callbacks reachable through enabled action buttons", () => {
    const row = basePanel().patchRows[0];

    expect(canApprove(row)).toBe(true);
    expect(canApply(row)).toBe(false);
    expect(canReject(row)).toBe(true);
  });

  it("enables apply only for ready patch gates", () => {
    const ready = {
      ...basePanel().patchRows[0],
      gate: {
        status: "ready_to_apply" as const,
        message: "Patch is approved and passed safety checks."
      }
    };

    expect(canApprove(ready)).toBe(false);
    expect(canApply(ready)).toBe(true);
    expect(canReject(ready)).toBe(true);
  });
});
