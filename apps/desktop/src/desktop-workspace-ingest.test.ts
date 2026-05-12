import { describe, expect, it } from "vitest";

import type { PersistRuntimeGraphRagPayload, WorkspaceIngestQueueItem } from "./desktop-contracts";
import {
  buildWorkspaceIngestQueueItem,
  deriveWorkspaceIngestQueueSummary
} from "./desktop-workspace-ingest";

const createdAt = "2026-05-13T09:00:00.000Z";

const document = {
  workspaceId: "workspace-alpha",
  documentId: "doc-alpha",
  documentPath: "experiments/alpha.chemd.md",
  documentHash: "fnv1a:doc-alpha-v1",
  revisionId: "rev-alpha-1",
  revisionHash: "fnv1a:revision-alpha-v1",
  modifiedAtMs: 1778653200000
};

const buildPayload = (
  revisionId = "rev-alpha-1",
  graphSnapshotId = "snapshot-alpha-1"
): PersistRuntimeGraphRagPayload => ({
  graphSnapshot: {
    graphSnapshotId,
    experimentId: "exp-alpha",
    sourceRevisionIds: [revisionId],
    graphKind: "reaction",
    nodeCount: 1,
    edgeCount: 0,
    createdAt
  },
  nodes: [{
    nodeId: "node-alpha-1",
    graphSnapshotId,
    experimentId: "exp-alpha",
    revisionId,
    entityId: "mol-alpha",
    sourceRange: { startLine: 1, endLine: 3 },
    payload: { kind: "molecule", smiles: "CCO" },
    createdAt
  }],
  edges: [],
  citationCandidates: [],
  agentRuns: [],
  agentToolCalls: [],
  patchProposals: [],
  metadata: {
    workspaceId: document.workspaceId,
    documentId: document.documentId,
    documentPath: document.documentPath,
    revisionId,
    revisionHash: document.revisionHash,
    sourceHash: document.documentHash,
    graphSnapshotId
  },
  createdAt
});

const buildItem = (
  status: WorkspaceIngestQueueItem["status"],
  overrides: Partial<WorkspaceIngestQueueItem> = {}
): WorkspaceIngestQueueItem => ({
  ...buildWorkspaceIngestQueueItem({
    document,
    runtimePayload: buildPayload(`rev-${status}`, `snapshot-${status}`),
    status,
    createdAt,
    updatedAt: createdAt
  }),
  ...overrides
});

describe("desktop workspace ingest queue builder", () => {
  it("keeps idempotency keys stable for the same document revision and snapshot", () => {
    const first = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });
    const second = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });

    expect(second.queueId).toBe(first.queueId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toMatch(/^workspace-ingest:fnv1a:/);
    expect(first).toMatchObject({
      workspaceId: document.workspaceId,
      documentPath: document.documentPath,
      documentHash: document.documentHash,
      revisionHash: document.revisionHash,
      graphSnapshotId: "snapshot-alpha-1",
      status: "pending"
    });
  });

  it("changes idempotency keys when the local file hash changes", () => {
    const current = buildWorkspaceIngestQueueItem({ document, runtimePayload: buildPayload(), createdAt });
    const changed = buildWorkspaceIngestQueueItem({
      document: {
        ...document,
        documentHash: "fnv1a:doc-alpha-v2",
        revisionHash: "fnv1a:revision-alpha-v2"
      },
      runtimePayload: buildPayload("rev-alpha-2", "snapshot-alpha-2"),
      createdAt
    });

    expect(changed.idempotencyKey).not.toBe(current.idempotencyKey);
    expect(changed.queueId).not.toBe(current.queueId);
  });

  it("derives a queue item from compile output without runtime payload IO", () => {
    const item = buildWorkspaceIngestQueueItem({
      document: { ...document, revisionHash: undefined },
      compileOutput: {
        status: "ok",
        graphSnapshot: { graphSnapshotId: "compile-snapshot-1" },
        diagnostics: []
      },
      createdAt
    });

    expect(item.runtimePayload).toBeUndefined();
    expect(item.graphSnapshotId).toBe("compile-snapshot-1");
    expect(item.metadata.compileOutputHash).toMatch(/^fnv1a:/);
    expect(item.revisionHash).toMatch(/^fnv1a:/);
  });

  it("counts failed, skipped, running, pending, synced, and retryable items", () => {
    const summary = deriveWorkspaceIngestQueueSummary([
      buildItem("pending"),
      buildItem("running"),
      buildItem("synced"),
      buildItem("skipped"),
      buildItem("failed", { failureCount: 1, errorSummary: "temporary compile failure" }),
      buildItem("failed", { failureCount: 4, errorSummary: "permanent compile failure" })
    ], { maxRetryFailures: 3 });

    expect(summary).toMatchObject({
      pendingCount: 1,
      runningCount: 1,
      syncedCount: 1,
      skippedCount: 1,
      failedCount: 2,
      retryableCount: 2,
      totalCount: 6
    });
    expect(summary.errors.map((error) => error.retryable)).toEqual([true, false]);
  });

  it("redacts and bounds failed workspace ingest error summaries", () => {
    const failed = buildWorkspaceIngestQueueItem({
      document,
      runtimePayload: buildPayload(),
      status: "failed",
      failureCount: 1,
      errorSummary: "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed with a very long workspace ingest message",
      createdAt
    });
    const summary = deriveWorkspaceIngestQueueSummary([failed], { maxErrorLength: 80 });

    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(summary.errors[0].errorSummary).toContain("token=[redacted]");
    expect(summary.errors[0].errorSummary).not.toContain("secret@localhost");
    expect(summary.errors[0].errorSummary.length).toBeLessThanOrEqual(80);
  });
});
