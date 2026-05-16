import { describe, expect, it } from "vitest";

import {
  AGENT_TOOL_NAMES,
  getAgentToolContract,
  listAgentToolContracts,
  resolveAgentToolAvailability,
  summarizeAgentToolInput,
  summarizeAgentToolOutput
} from "./index";

describe("desktop agent tool contracts", () => {
  it("locks the desktop-orchestrated tool list", () => {
    expect(AGENT_TOOL_NAMES).toEqual([
      "compile_current_file",
      "query_rag",
      "inspect_reaction_graph",
      "semantic_diff",
      "propose_repair",
      "apply_approved_patch"
    ]);
  });

  it("defines UI, summary, requirement, and availability metadata for every tool", () => {
    for (const contract of listAgentToolContracts()) {
      expect(contract.display.label.length).toBeGreaterThan(0);
      expect(contract.display.description.length).toBeGreaterThan(0);
      expect(contract.display.resultLabel.length).toBeGreaterThan(0);
      expect(typeof contract.requires.workspace).toBe("boolean");
      expect(typeof contract.requires.currentFile).toBe("boolean");
      expect(typeof contract.requires.explicitApproval).toBe("boolean");
      expect(contract.availability.offline.summary.length).toBeGreaterThan(0);
      expect(contract.availability.connected.summary.length).toBeGreaterThan(0);
      expect(contract.summaryStrategy.input.length).toBeGreaterThan(0);
      expect(contract.summaryStrategy.output.length).toBeGreaterThan(0);
    }
  });

  it("marks write application as requiring explicit approval", () => {
    const contract = getAgentToolContract("apply_approved_patch");

    expect(contract.requires).toEqual({
      workspace: true,
      currentFile: false,
      explicitApproval: true
    });
  });

  it("keeps connected RAG available and offline RAG degraded", () => {
    expect(getAgentToolContract("query_rag").availability).toMatchObject({
      offline: {
        level: "degraded"
      },
      connected: {
        level: "available"
      }
    });
  });
});

describe("desktop agent tool availability", () => {
  it("blocks workspace-bound tools when no workspace is selected", () => {
    const availability = resolveAgentToolAvailability("query_rag", {
      connectivity: "connected",
      hasWorkspace: false,
      hasCurrentFile: true,
      hasExplicitApproval: false
    });

    expect(availability).toEqual({
      level: "unavailable",
      summary: "Workspace is required.",
      blockedReasons: ["Workspace is required."]
    });
  });

  it("blocks patch application until explicit approval exists", () => {
    const availability = resolveAgentToolAvailability("apply_approved_patch", {
      connectivity: "offline",
      hasWorkspace: true,
      hasCurrentFile: false,
      hasExplicitApproval: false
    });

    expect(availability.blockedReasons).toEqual(["Explicit approval is required."]);
    expect(availability.level).toBe("unavailable");
  });

  it("returns mode-specific availability once requirements are met", () => {
    const availability = resolveAgentToolAvailability("propose_repair", {
      connectivity: "offline",
      hasWorkspace: true,
      hasCurrentFile: true,
      hasExplicitApproval: false
    });

    expect(availability).toMatchObject({
      level: "degraded",
      blockedReasons: []
    });
  });
});

describe("desktop agent tool summaries", () => {
  it("summarizes compile input without inlining source", () => {
    const summary = summarizeAgentToolInput("compile_current_file", {
      filePath: "experiments/demo.chemd",
      source: "step a\nstep b"
    });

    expect(summary).toBe("file: experiments/demo.chemd, source: 13 chars");
  });

  it("summarizes RAG output with result and citation counts", () => {
    const summary = summarizeAgentToolOutput("query_rag", {
      query: "catalyst workup",
      hits: [{ id: "chunk-1" }, { id: "chunk-2" }],
      citations: [{ citationId: "c1" }],
      sources: ["notebook-a", "notebook-b", "notebook-c", "notebook-d"]
    });

    expect(summary).toBe(
      "query: catalyst workup, hits: 2, citations: 1, sources: notebook-a, notebook-b, notebook-c"
    );
  });

  it("summarizes approved patch application state", () => {
    const summary = summarizeAgentToolInput("apply_approved_patch", {
      patchProposalId: "proposal-1",
      userApprovalId: "approval-1",
      edits: [{ replacement: "fixed" }],
      files: ["experiments/demo.chemd"],
      revisionId: "rev-2"
    });

    expect(summary).toBe(
      "proposal: proposal-1, approval: approval-1, edits: 1, files: experiments/demo.chemd, revision: rev-2"
    );
  });
});
