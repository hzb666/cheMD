import { describe, expect, it } from "vitest";

import type { AgentRun } from "@chemd/agent-tools";
import { buildEditorGraphRagRecords } from "@chemd/language-service";

import {
  buildRuntimePersistencePayload,
  buildPersistRuntimeGraphRagCommandInput,
  persistRuntimeGraphRagCommand,
  type JsonValue
} from "./persistence";

const createdAt = "2026-05-12T02:30:00.000Z";
const source = `---
id: exp-desktop-persist
title: Desktop persistence
date: 2026-05-12
---

:::chemd #mol-a
kind: molecule
smiles: CCO
:::

:::chemd #rxn-a
kind: reaction
reactants: mol-a
products: product-a
:::

:::result #res-a
reaction: rxn-a
status: success
yield: 82%
:::
`;

const workspace = {
  workspaceId: "workspace-alpha",
  rootPath: "D:/labs/alpha",
  displayName: "Alpha Lab"
};

const document = {
  path: "experiments/desktop-persist.chemd",
  documentId: "doc-desktop-persist",
  documentUri: "file:///D:/labs/alpha/experiments/desktop-persist.chemd",
  revisionId: "rev-desktop-persist-1"
};

const buildRecords = () => buildEditorGraphRagRecords({
  source,
  documentUri: document.documentUri,
  experimentId: "exp-desktop-persist",
  revisionId: document.revisionId,
  createdAt
});

const buildPayload = (agentRun?: AgentRun | null) =>
  buildRuntimePersistencePayload({ records: buildRecords(), source, workspace, document, agentRun });

const isPlainJsonObject = (value: unknown): boolean =>
  Boolean(value)
  && typeof value === "object"
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;

const assertJsonSafe = (value: JsonValue): void => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach(assertJsonSafe);
    return;
  }
  expect(isPlainJsonObject(value)).toBe(true);
  Object.values(value).forEach(assertJsonSafe);
};

const agentRun: AgentRun = {
  agentRunId: "run-desktop-1",
  workspaceId: workspace.workspaceId,
  goal: "Persist approved repair proposal",
  targetFiles: [document.path],
  status: "completed",
  toolCalls: [{
    toolCallId: "tool-desktop-1",
    agentRunId: "run-desktop-1",
    workspaceId: workspace.workspaceId,
    toolName: "query_rag",
    payload: new Map<string, unknown>([
      ["query", "yield evidence"],
      ["dropFunction", () => "not json"]
    ]),
    status: "ok",
    result: {
      toolCallId: "tool-desktop-1",
      status: "ok",
      payload: { matchedAt: new Date(createdAt), count: 1 },
      evidence: []
    },
    startedAt: createdAt,
    finishedAt: createdAt
  }],
  evidence: [{
    kind: "rag",
    documentId: document.documentId,
    revisionId: document.revisionId,
    filePath: document.path,
    summary: "RAG citation supports the repair.",
    citation: {
      citationId: "citation-rag-1",
      sourceLabel: "RAG chunk",
      documentId: document.documentId,
      revisionId: document.revisionId,
      uri: document.documentUri
    }
  }],
  patchProposals: [{
    patchProposalId: "patch-desktop-1",
    documentId: document.documentId,
    beforeHash: "fnv1a:before",
    title: "Add reaction note",
    rationale: "Agent repair proposal from current editor state.",
    edits: [{
      range: { startLine: 14, startColumn: 1, endLine: 14, endColumn: 1 },
      replacement: "note: persisted\n"
    }],
    evidence: []
  }],
  patchDecisions: [{
    decisionId: "decision-desktop-1",
    patchProposalId: "patch-desktop-1",
    kind: "applied",
    userApprovalId: "approval-desktop-1",
    decidedAt: createdAt
  }],
  auditTimeline: [{
    eventId: "event-desktop-1",
    agentRunId: "run-desktop-1",
    type: "status_transitioned",
    summary: "Agent moved from validating to completed.",
    at: createdAt,
    fromStatus: "validating",
    toStatus: "completed",
    toolCallId: "tool-desktop-1",
    patchProposalId: "patch-desktop-1",
    evidenceIndexes: [0]
  }],
  validationResult: {
    toolCallId: "tool-desktop-1",
    status: "ok",
    payload: { validation: "passed" },
    evidence: []
  },
  createdAt,
  updatedAt: createdAt
};

describe("desktop runtime persistence payload builder", () => {
  it("generates deterministic graph snapshot, node, edge, and citation ids", () => {
    const first = buildPayload();
    const second = buildPayload();
    const otherDocument = buildRuntimePersistencePayload({
      records: buildRecords(),
      source,
      workspace,
      document: { ...document, path: "experiments/other.chemd" }
    });

    expect(second.graphSnapshot.graphSnapshotId).toBe(first.graphSnapshot.graphSnapshotId);
    expect(second.nodes.map((node) => node.nodeId)).toEqual(first.nodes.map((node) => node.nodeId));
    expect(second.edges.map((edge) => edge.edgeId)).toEqual(first.edges.map((edge) => edge.edgeId));
    expect(second.citationCandidates.map((item) => item.citationId))
      .toEqual(first.citationCandidates.map((item) => item.citationId));
    expect(otherDocument.graphSnapshot.graphSnapshotId).not.toBe(first.graphSnapshot.graphSnapshotId);
  });

  it("builds a Graph/RAG-only command payload without Agent state", () => {
    const commandInput = buildPersistRuntimeGraphRagCommandInput({
      records: buildRecords(),
      source,
      workspace,
      document
    });

    expect(persistRuntimeGraphRagCommand).toBe("persist_runtime_graph_rag");
    expect(commandInput.payload.graphSnapshot).toMatchObject({
      experimentId: "exp-desktop-persist",
      sourceRevisionIds: [document.revisionId],
      graphKind: "reaction"
    });
    expect(commandInput.payload.nodes.length).toBeGreaterThan(0);
    expect(commandInput.payload.edges.length).toBeGreaterThan(0);
    expect(commandInput.payload.citationCandidates.length).toBeGreaterThan(0);
    expect(commandInput.payload.agentRuns).toEqual([]);
    expect(commandInput.payload.agentToolCalls).toEqual([]);
    expect(commandInput.payload.patchProposals).toEqual([]);
  });

  it("maps Agent run, tool call, and patch proposal state", () => {
    const payload = buildPayload(agentRun);

    expect(payload.agentRuns[0]).toMatchObject({
      agentRunId: "run-desktop-1",
      experimentId: "exp-desktop-persist",
      revisionId: document.revisionId,
      status: "completed",
      auditTimeline: [{
        eventId: "event-desktop-1",
        agentRunId: "run-desktop-1",
        type: "status_transitioned",
        summary: "Agent moved from validating to completed.",
        at: createdAt
      }],
      finishedAt: createdAt
    });
    expect(payload.agentToolCalls[0]).toMatchObject({
      toolCallId: "tool-desktop-1",
      toolName: "query_rag",
      input: { query: "yield evidence" },
      output: { payload: { matchedAt: createdAt, count: 1 } }
    });
    expect(payload.patchProposals[0]).toMatchObject({
      patchProposalId: "patch-desktop-1",
      baseRevisionId: document.revisionId,
      status: "applied",
      appliedAt: createdAt,
      patch: {
        beforeHash: "fnv1a:before",
        title: "Add reaction note"
      }
    });
  });

  it("emits JSON-safe payloads without functions, Maps, Dates, or class instances", () => {
    const payload = buildPayload(agentRun);

    expect(() => JSON.stringify(payload)).not.toThrow();
    assertJsonSafe(payload as unknown as JsonValue);
    expect(JSON.stringify(payload)).not.toContain("dropFunction");
  });

  it("validates required source, workspace, document, and revision fields", () => {
    const recordsWithoutRevision = {
      ...buildRecords(),
      graphSnapshot: { ...buildRecords().graphSnapshot, sourceRevisionIds: [] }
    };

    expect(() => buildRuntimePersistencePayload({
      records: buildRecords(),
      source: undefined as unknown as string,
      workspace,
      document
    })).toThrow("source");
    expect(() => buildRuntimePersistencePayload({
      records: buildRecords(),
      source,
      workspace: { workspaceId: "" },
      document
    })).toThrow("workspace.workspaceId");
    expect(() => buildRuntimePersistencePayload({
      records: buildRecords(),
      source,
      workspace,
      document: { ...document, path: "" }
    })).toThrow("document.path");
    expect(() => buildRuntimePersistencePayload({
      records: recordsWithoutRevision,
      source,
      workspace,
      document: { ...document, revisionId: undefined }
    })).toThrow("revisionId");
  });
});
