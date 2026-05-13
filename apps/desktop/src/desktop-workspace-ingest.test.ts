import { describe, expect, it, vi } from "vitest";

import type {
  PersistRuntimeGraphRagPayload,
  WorkspaceFileEntry,
  WorkspaceIngestQueueItem
} from "./desktop-contracts";
import {
  buildWorkspaceIngestQueueItem,
  deriveWorkspaceIngestQueueSummary,
  runWorkspaceIngest
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

const fileEntry = (path: string, kind: WorkspaceFileEntry["kind"] = "file"): WorkspaceFileEntry => ({
  id: path,
  name: path.split("/").pop() ?? path,
  path,
  kind
});

describe("desktop workspace ingest runner", () => {
  it("processes .chemd.md files, skips plain markdown, and excludes other entries", async () => {
    const readPaths: string[] = [];
    const compileSources: string[] = [];
    const result = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [
        fileEntry("experiments/a.chemd.md"),
        fileEntry("notes/readme.md"),
        fileEntry("assets/table.csv"),
        fileEntry("experiments", "directory")
      ],
      readFile: (file) => {
        readPaths.push(file.path);
        return { content: `source:${file.path}`, modifiedAtMs: 1778653200000 };
      },
      compile: (source) => {
        compileSources.push(source);
        return { status: "ok", source };
      },
      createdAt
    });

    expect(readPaths).toEqual(["experiments/a.chemd.md"]);
    expect(compileSources).toEqual(["source:experiments/a.chemd.md"]);
    expect(result.items.map((item) => [item.documentPath, item.status])).toEqual([
      ["experiments/a.chemd.md", "pending"],
      ["notes/readme.md", "skipped"]
    ]);
    expect(result.items[1].metadata.skipReason).toBe("non_chemd_markdown");
    expect(result.summary).toMatchObject({ pendingCount: 1, skippedCount: 1, totalCount: 2 });
  });

  it("keeps ingest running when one file fails and redacts bounded failure summaries", async () => {
    const files = [fileEntry("experiments/fail.chemd.md"), fileEntry("experiments/pass.chemd.md")];
    const firstRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files,
      readFile: (file) => `source:${file.path}`,
      compile: (source) => {
        if (source.includes("fail")) {
          throw new Error(
            "DATABASE_URL=postgres://user:secret@localhost:5432/chemd token=abc failed with a very long workspace ingest compile message"
          );
        }
        return { status: "ok", source };
      },
      createdAt
    });
    const secondRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [files[0]],
      readFile: (file) => `source:${file.path}`,
      compile: () => {
        throw new Error("token=retry failed");
      },
      existingItems: firstRun.items,
      createdAt
    });
    const failed = firstRun.items.find((item) => item.status === "failed");

    expect(firstRun.summary).toMatchObject({ pendingCount: 1, failedCount: 1, totalCount: 2 });
    expect(failed?.errorSummary).toContain("DATABASE_URL=[redacted]");
    expect(failed?.errorSummary).toContain("token=[redacted]");
    expect(failed?.errorSummary).not.toContain("secret@localhost");
    expect(failed?.errorSummary?.length).toBeLessThanOrEqual(160);
    expect(secondRun.items[0].failureCount).toBe(2);
  });

  it("keeps source hashes and idempotency keys stable until file content changes", async () => {
    const file = fileEntry("experiments/stable.chemd.md");
    const runWithSource = (source: string) => runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => source,
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "stable-snapshot" } }),
      createdAt
    });

    const first = (await runWithSource("same source")).items[0];
    const second = (await runWithSource("same source")).items[0];
    const changed = (await runWithSource("changed source")).items[0];

    expect(second.documentHash).toBe(first.documentHash);
    expect(second.metadata.sourceHash).toBe(first.documentHash);
    expect(second.revisionHash).toBe(first.revisionHash);
    expect(second.queueId).toBe(first.queueId);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    expect(changed.documentHash).not.toBe(first.documentHash);
    expect(changed.revisionHash).not.toBe(first.revisionHash);
    expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("reuses an unchanged pending item without creating another pending revision", async () => {
    const file = fileEntry("experiments/pending.chemd.md");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "pending source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "pending-snapshot" } }),
      createdAt
    });
    const pending = initial.items[0];
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "pending source",
      compile,
      existingItems: [pending],
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items).toEqual([pending]);
    expect(resumed.summary).toMatchObject({ pendingCount: 1, totalCount: 1 });
  });

  it("reuses an unchanged synced item without compiling it again", async () => {
    const file = fileEntry("experiments/synced.chemd.md");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "synced source",
      compile: () => ({ status: "ok" }),
      createdAt
    });
    const synced: WorkspaceIngestQueueItem = { ...initial.items[0], status: "synced" };
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "synced source",
      compile,
      existingItems: [synced],
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items[0]).toEqual(synced);
    expect(resumed.summary).toMatchObject({ syncedCount: 1, pendingCount: 0 });
  });

  it("creates a new revision for changed content without overwriting existing items", async () => {
    const file = fileEntry("experiments/changed.chemd.md");
    const initial = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "old source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "old-snapshot" } }),
      createdAt
    });
    const oldPending = initial.items[0];
    const changed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "new source",
      compile: () => ({ status: "ok", graphSnapshot: { graphSnapshotId: "new-snapshot" } }),
      existingItems: [oldPending],
      createdAt
    });
    const newPending = changed.items[0];

    expect(changed.items).toHaveLength(2);
    expect(newPending.status).toBe("pending");
    expect(newPending.documentHash).not.toBe(oldPending.documentHash);
    expect(newPending.revisionHash).not.toBe(oldPending.revisionHash);
    expect(newPending.queueId).not.toBe(oldPending.queueId);
    expect(changed.items[1]).toEqual(oldPending);
    expect(changed.summary).toMatchObject({ pendingCount: 2, totalCount: 2 });
  });

  it("keeps failed items over the retry limit failed instead of making them pending", async () => {
    const file = fileEntry("experiments/exhausted.chemd.md");
    const failedRun = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "exhausted source",
      compile: () => {
        throw new Error("compile failed");
      },
      createdAt
    });
    const exhausted: WorkspaceIngestQueueItem = {
      ...failedRun.items[0],
      failureCount: 3,
      errorSummary: "compile failed three times"
    };
    const compile = vi.fn(() => ({ status: "ok" }));
    const resumed = await runWorkspaceIngest({
      workspaceId: "workspace-alpha",
      files: [file],
      readFile: () => "exhausted source",
      compile,
      existingItems: [exhausted],
      maxRetryFailures: 3,
      createdAt
    });

    expect(compile).not.toHaveBeenCalled();
    expect(resumed.items).toEqual([exhausted]);
    expect(resumed.summary).toMatchObject({ failedCount: 1, retryableCount: 0 });
    expect(resumed.summary.errors[0]).toMatchObject({ failureCount: 3, retryable: false });
  });
});
